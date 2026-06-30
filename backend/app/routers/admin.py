"""Admin panel endpoints — protected by X-Admin-Key header.

Provides query logs, schema viewing, embedding management,
and dashboard statistics for administrators.
"""

import logging
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.models.connection import DatabaseConnection
from app.models.schema_metadata import TableMetadata
from app.models.query_log import QueryLog
from app.schemas.admin import (
    QueryLogResponse,
    QueryLogListResponse,
    SchemaMetadataResponse,
    AdminStatsResponse,
    EmbeddingRebuildResponse,
)
from app.services.embedding_service import generate_embeddings_for_connection
from app.services.schema_introspector import introspect_database

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


async def verify_admin_key(x_admin_key: str = Header(...)):
    """Verify the admin API key from request header."""
    settings = get_settings()
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=403, detail="Invalid admin API key")
    return True


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    session: AsyncSession = Depends(get_session),
    _admin: bool = Depends(verify_admin_key),
):
    """Get dashboard statistics."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total queries
    total_result = await session.execute(select(func.count()).select_from(QueryLog))
    total_queries = total_result.scalar() or 0

    # Queries today
    today_result = await session.execute(
        select(func.count()).select_from(QueryLog).where(
            QueryLog.created_at >= today_start
        )
    )
    queries_today = today_result.scalar() or 0

    # Average execution time
    avg_result = await session.execute(
        select(func.avg(QueryLog.execution_time_ms)).where(
            QueryLog.status == "success"
        )
    )
    avg_execution_time = avg_result.scalar() or 0.0

    # Success rate
    success_result = await session.execute(
        select(func.count()).select_from(QueryLog).where(
            QueryLog.status == "success"
        )
    )
    success_count = success_result.scalar() or 0
    success_rate = (success_count / total_queries * 100) if total_queries > 0 else 0.0

    # Active connections
    conn_result = await session.execute(
        select(func.count()).select_from(DatabaseConnection).where(
            DatabaseConnection.is_active == True
        )
    )
    active_connections = conn_result.scalar() or 0

    # Total tables
    table_result = await session.execute(
        select(func.count()).select_from(TableMetadata)
    )
    total_tables = table_result.scalar() or 0

    # Blocked queries
    blocked_result = await session.execute(
        select(func.count()).select_from(QueryLog).where(
            QueryLog.status == "blocked"
        )
    )
    blocked_queries = blocked_result.scalar() or 0

    return AdminStatsResponse(
        total_queries=total_queries,
        queries_today=queries_today,
        avg_execution_time_ms=float(avg_execution_time),
        success_rate=round(success_rate, 1),
        active_connections=active_connections,
        total_tables=total_tables,
        blocked_queries=blocked_queries,
    )


@router.get("/logs", response_model=QueryLogListResponse)
async def get_query_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    connection_id: UUID | None = None,
    status_filter: str | None = None,
    session: AsyncSession = Depends(get_session),
    _admin: bool = Depends(verify_admin_key),
):
    """Get paginated query logs with optional filters."""
    query = select(QueryLog)

    if connection_id:
        query = query.where(QueryLog.connection_id == connection_id)
    if status_filter:
        query = query.where(QueryLog.status == status_filter)

    # Count total
    count_query = select(func.count()).select_from(QueryLog)
    if connection_id:
        count_query = count_query.where(QueryLog.connection_id == connection_id)
    if status_filter:
        count_query = count_query.where(QueryLog.status == status_filter)

    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    query = query.order_by(QueryLog.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await session.execute(query)
    logs = result.scalars().all()

    return QueryLogListResponse(
        logs=[QueryLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/logs/{log_id}/sql")
async def get_query_sql(
    log_id: UUID,
    session: AsyncSession = Depends(get_session),
    _admin: bool = Depends(verify_admin_key),
):
    """View the generated SQL for a specific query log (admin only)."""
    result = await session.execute(
        select(QueryLog).where(QueryLog.id == log_id)
    )
    log = result.scalar_one_or_none()

    if not log:
        raise HTTPException(status_code=404, detail="Query log not found")

    return {
        "id": log.id,
        "natural_language_query": log.natural_language_query,
        "generated_sql": log.generated_sql,
        "status": log.status,
        "error_message": log.error_message,
    }


@router.get("/schema/{connection_id}", response_model=SchemaMetadataResponse)
async def get_schema_metadata(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
    _admin: bool = Depends(verify_admin_key),
):
    """View schema metadata for a connection."""
    # Get connection
    conn_result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = conn_result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Get tables
    table_result = await session.execute(
        select(TableMetadata).where(
            TableMetadata.connection_id == connection_id
        ).order_by(TableMetadata.table_name)
    )
    tables = table_result.scalars().all()

    return SchemaMetadataResponse(
        connection_id=connection_id,
        connection_name=connection.name,
        tables=[
            {
                "table_name": t.table_name,
                "schema_name": t.schema_name,
                "description": t.description,
                "row_count_estimate": t.row_count_estimate,
                "columns": t.columns,
                "relationships": t.relationships,
            }
            for t in tables
        ],
        total_tables=len(tables),
        last_introspected_at=connection.last_introspected_at,
    )


@router.get("/connections/{connection_id}/policies")
async def get_connection_rls_policies(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
    _admin: bool = Depends(verify_admin_key),
):
    """Generate PostgreSQL Row Level Security (RLS) policies for a connection."""
    conn_result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = conn_result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    table_result = await session.execute(
        select(TableMetadata).where(
            TableMetadata.connection_id == connection_id
        )
    )
    tables = list(table_result.scalars().all())

    from app.services.access_control import generate_rls_policies
    policies_sql = generate_rls_policies(connection.name, tables)

    return {
        "connection_id": connection_id,
        "connection_name": connection.name,
        "policies_sql": policies_sql
    }


@router.post("/schema/{connection_id}/refresh")
async def refresh_schema(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
    _admin: bool = Depends(verify_admin_key),
):
    """Re-introspect a database schema."""
    conn_result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = conn_result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    tables = await introspect_database(
        session=session,
        connection_id=connection_id,
        host=connection.host_encrypted,
        port=connection.port_encrypted,
        database=connection.database_encrypted,
        username=connection.username_encrypted,
        password=connection.password_encrypted,
    )

    connection.last_introspected_at = datetime.now(timezone.utc)
    await session.flush()

    return {"message": "Schema refreshed", "tables_found": len(tables)}


@router.post(
    "/embeddings/{connection_id}/rebuild",
    response_model=EmbeddingRebuildResponse,
)
async def rebuild_embeddings(
    connection_id: UUID,
    session: AsyncSession = Depends(get_session),
    _admin: bool = Depends(verify_admin_key),
):
    """Rebuild all embeddings for a connection."""
    conn_result = await session.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == connection_id)
    )
    connection = conn_result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Count tables
    table_result = await session.execute(
        select(func.count()).select_from(TableMetadata).where(
            TableMetadata.connection_id == connection_id
        )
    )
    table_count = table_result.scalar() or 0

    if table_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No schema metadata found. Run introspection first.",
        )

    embeddings_count = await generate_embeddings_for_connection(
        session=session,
        connection_id=connection_id,
    )

    return EmbeddingRebuildResponse(
        connection_id=connection_id,
        embeddings_created=embeddings_count,
        tables_processed=table_count,
        message="Embeddings rebuilt successfully",
    )
