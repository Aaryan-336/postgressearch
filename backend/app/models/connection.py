"""Database connection model — stores encrypted credentials for user PostgreSQL databases."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DatabaseConnection(Base):
    """Represents a user's PostgreSQL database connection.

    All credential fields are Fernet-encrypted at rest.
    Decrypted only at query execution time, never cached.
    """

    __tablename__ = "connections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="User-friendly connection name",
    )

    # ── Encrypted credential fields ──
    host_encrypted: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Fernet-encrypted host"
    )
    port_encrypted: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Fernet-encrypted port"
    )
    database_encrypted: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Fernet-encrypted database name"
    )
    username_encrypted: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Fernet-encrypted username"
    )
    password_encrypted: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Fernet-encrypted password"
    )

    # ── State ──
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    last_introspected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Timestamps ──
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<DatabaseConnection(id={self.id}, name='{self.name}')>"
