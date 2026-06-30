"""Query log model — audit trail for all natural language queries."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QueryLog(Base):
    """Audit log for every natural language query processed.

    Records the input question, generated SQL, execution metrics,
    and status for admin review and debugging.
    """

    __tablename__ = "query_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("connections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    natural_language_query: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    generated_sql: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    execution_time_ms: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    row_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    # "success" | "error" | "blocked" | "timeout"
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(45), nullable=True
    )
    user_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, comment="User email for audit logging"
    )
    user_role: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="User role for audit logging"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return f"<QueryLog(id={self.id}, status='{self.status}')>"
