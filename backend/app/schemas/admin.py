"""Pydantic schemas for admin panel endpoints."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class QueryLogResponse(BaseModel):
    """Response body for a single query log entry."""

    id: UUID
    connection_id: UUID | None
    natural_language_query: str
    generated_sql: str | None = None  # Only included when admin requests it
    execution_time_ms: int | None
    row_count: int | None
    status: str
    error_message: str | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class QueryLogListResponse(BaseModel):
    """Paginated list of query logs."""

    logs: list[QueryLogResponse]
    total: int
    page: int
    page_size: int


class SchemaMetadataResponse(BaseModel):
    """Response body for schema metadata of a connection."""

    connection_id: UUID
    connection_name: str
    tables: list[dict[str, Any]]
    total_tables: int
    last_introspected_at: datetime | None


class AdminStatsResponse(BaseModel):
    """Dashboard statistics for the admin panel."""

    total_queries: int
    queries_today: int
    avg_execution_time_ms: float
    success_rate: float
    active_connections: int
    total_tables: int
    blocked_queries: int


class EmbeddingRebuildResponse(BaseModel):
    """Response for embedding rebuild operations."""

    connection_id: UUID
    embeddings_created: int
    tables_processed: int
    message: str
