"""Pydantic schemas for database connection requests and responses."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ConnectionCreate(BaseModel):
    """Request body for creating a new database connection."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="User-friendly connection name",
        examples=["Production HR Database"],
    )

    # Users can provide either a connection string or individual fields
    connection_string: str | None = Field(
        default=None,
        description="PostgreSQL connection string (postgresql://user:pass@host:port/db)",
        examples=["postgresql://readonly@db.example.com:5432/hrdb"],
    )

    # Individual connection fields (used if connection_string is not provided)
    host: str | None = Field(default=None, examples=["db.example.com"])
    port: int | None = Field(default=5432, ge=1, le=65535)
    database: str | None = Field(default=None, examples=["hrdb"])
    username: str | None = Field(default=None, examples=["readonly_user"])
    password: str | None = Field(default=None, examples=["secure_password"])


class ConnectionResponse(BaseModel):
    """Response body for connection details — never exposes credentials."""

    id: UUID
    name: str
    is_active: bool
    last_introspected_at: datetime | None
    table_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectionTestResponse(BaseModel):
    """Response body for connection test results."""

    success: bool
    message: str
    server_version: str | None = None
