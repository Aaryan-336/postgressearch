"""Schema embedding model — stores pgvector embeddings for semantic search over schema metadata."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.database import Base

# Embedding dimension for Google text-embedding-004
EMBEDDING_DIM = 768


class SchemaEmbedding(Base):
    """Stores vector embeddings for schema metadata.

    Embeddings are created ONLY for:
    - Table descriptions
    - Column names and types
    - Relationship descriptions
    - Business metadata

    Never for actual data rows.
    """

    __tablename__ = "schema_embeddings"

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

    # The text content that was embedded
    content: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    content_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="table_description | column | relationship",
    )
    source_table: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    source_column: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    # pgvector embedding column
    embedding = mapped_column(
        Vector(EMBEDDING_DIM), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<SchemaEmbedding(type='{self.content_type}', table='{self.source_table}')>"
