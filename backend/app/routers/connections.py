"""Connection management endpoints — CRUD for database connections.

All credentials are encrypted before storage.
Responses never expose credentials.
"""

import logging
from urllib.parse import urlparse
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.connection import DatabaseConnection
from app.models.schema_metadata import TableMetadata
from app.schemas.connection import (
    ConnectionCreate,
    ConnectionResponse,
    ConnectionTestResponse,
)
from app.services.encryption import encrypt, decrypt
from app.services.schema_introspector import introspect_database
from app.services.embedding_service import generate_embeddings_for_connection

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/connections", tags=["connections"])


def _parse_connection_string(conn_str: str) -> dict:
    """Parse a PostgreSQL connection string into individual components."""
    parsed = urlparse(conn_str)
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "database": parsed.path.lstrip("/") if parsed.path else "",
        "username": parsed.username or "",
        "password": parsed.password or "",
    }


@router.post("", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    body: ConnectionCreate,
    session: AsyncSession = Depends(get_session),
):
    """Create a new database connection with encrypted credentials."""
    # Parse connection details
    if body.connection_string:
        parts = _parse_connection_string(body.connection_string)
    else:
        if not all([body.host, body.database, body.username]):
            raise HTTPException(
                status_code=400,
                detail="Provide either a connection string or host, database, and username.",
            )
        parts = {
            "host": body.host,
            "port": str(body.port or 5432),
            "database": body.database,
            "username": body.username,
            "password": body.password or "",
        }

    # Encrypt all credential fields
    connection = DatabaseConnection(
        name=body.name,
        host_encrypted=encrypt(parts["host"]),
        port_encrypted=encrypt(parts["port"]),
        database_encrypted=encrypt(parts["database"]),
        username_encrypted=encrypt(parts["username"]),
        password_encrypted=encrypt(parts["password"]),
    )
    session.add(connection)
    await session.flush()

    logger.info(f"Created connection '{body.name}' (id={connection.id})")

    return ConnectionResponse(
        id=connection.id,
        name=connection.name,
        is_active=connection.is_active,
        last_introspected_at=connection.last_introspected_at,
        table_count=0,
        created_at=connection.created_at,
        updated_at=connection.updated_at,
    )


@router.get("", response_model=list[ConnectionResponse])
async def list_connections(
    session: AsyncSession = Depends(get_session),
):
    """List all database connections — never exposes credentials."""
    result = await session.execute(
        select(DatabaseConnection).order_by(DatabaseConnection.created_at.desc())
    )
    connections = result.scalars().all()

    responses = []
    for conn in connections:
        # Count tables for this connection
        count_result = await session.execute(
            select(func.count()).where(TableMetadata.connection_id == conn.id)
        )
        table_count = count_result.scalar() or 0

        responses.append(
            ConnectionResponse(
                id=conn.id,
                name=conn.name,
                is_active=conn.is_active,
                last_introspected_at=conn.last_introspected_at,
                table_count=table_count,
                created_at=conn.created_at,
                updated_at=conn.updated_at,
            )
        )

    return responses


@router.get("/{connection_id}", response_model=ConnectionResponse)
async def get_connection(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """Get a single connection's details — never exposes credentials."""
    result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = result.scalar_one_or_none()

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    count_result = await session.execute(
        select(func.count()).where(TableMetadata.connection_id == connection.id)
    )
    table_count = count_result.scalar() or 0

    return ConnectionResponse(
        id=connection.id,
        name=connection.name,
        is_active=connection.is_active,
        last_introspected_at=connection.last_introspected_at,
        table_count=table_count,
        created_at=connection.created_at,
        updated_at=connection.updated_at,
    )


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """Delete a database connection and all associated metadata."""
    result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = result.scalar_one_or_none()

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    await session.delete(connection)
    logger.info(f"Deleted connection '{connection.name}' (id={connection_id})")


@router.post("/{connection_id}/test", response_model=ConnectionTestResponse)
async def test_connection(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """Test connectivity to a database."""
    result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = result.scalar_one_or_none()

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    try:
        conn = await asyncpg.connect(
            host=decrypt(connection.host_encrypted),
            port=int(decrypt(connection.port_encrypted)),
            database=decrypt(connection.database_encrypted),
            user=decrypt(connection.username_encrypted),
            password=decrypt(connection.password_encrypted),
            timeout=10,
        )
        try:
            version = await conn.fetchval("SELECT version()")
            return ConnectionTestResponse(
                success=True,
                message="Connection successful",
                server_version=version,
            )
        finally:
            await conn.close()

    except Exception as e:
        return ConnectionTestResponse(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


@router.post("/{connection_id}/introspect")
async def introspect_connection(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """Introspect database schema and build embeddings."""
    result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = result.scalar_one_or_none()

    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Introspect schema
    tables = await introspect_database(
        session=session,
        connection_id=connection_id,
        host=connection.host_encrypted,
        port=connection.port_encrypted,
        database=connection.database_encrypted,
        username=connection.username_encrypted,
        password=connection.password_encrypted,
    )

    # Update last introspected timestamp
    from datetime import datetime, timezone
    connection.last_introspected_at = datetime.now(timezone.utc)

    # Generate embeddings
    embeddings_count = await generate_embeddings_for_connection(
        session=session,
        connection_id=connection_id,
    )

    await session.flush()

    return {
        "message": "Schema introspection and embedding generation complete",
        "tables_found": len(tables),
        "embeddings_created": embeddings_count,
    }
