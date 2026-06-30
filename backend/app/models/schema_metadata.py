"""Schema metadata model — stores table structure extracted from user databases."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, BigInteger, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TableMetadata(Base):
    """Stores schema metadata for a table from the user's database.

    Columns and relationships are stored as structured JSON.
    No actual row data is ever stored.
    """

    __tablename__ = "table_metadata"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("connections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    table_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    schema_name: Mapped[str] = mapped_column(
        String(255), default="public", nullable=False
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="Auto-generated or user-provided description"
    )
    row_count_estimate: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False
    )

    # Structured JSON: [{name, type, nullable, is_pk, default, fk_ref}]
    columns: Mapped[dict] = mapped_column(
        JSONB, default=list, nullable=False
    )

    # Structured JSON: [{from_col, to_table, to_col, rel_type}]
    relationships: Mapped[dict] = mapped_column(
        JSONB, default=list, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<TableMetadata(table='{self.schema_name}.{self.table_name}')>"
