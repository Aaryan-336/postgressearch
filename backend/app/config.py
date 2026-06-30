"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ── Database ──
    database_url: str = Field(
        default="postgresql+asyncpg://nlpsearch_user:password@localhost:5432/nlpsearch_internal",
        description="Internal PostgreSQL connection string (asyncpg driver)",
    )

    # ── Google Gemini & Groq ──
    gemini_api_key: str = Field(
        default="",
        description="Google AI Studio API key",
    )
    groq_api_key: str = Field(
        default="",
        description="Groq Cloud API key",
    )

    # ── Security ──
    fernet_key: str = Field(
        default="",
        description="Fernet encryption key for credential storage",
    )
    admin_api_key: str = Field(
        default="changeme",
        description="API key for admin endpoints",
    )

    # ── Query Limits ──
    max_rows: int = Field(
        default=100,
        description="Maximum rows returned per query",
        ge=1,
        le=1000,
    )
    query_timeout_seconds: int = Field(
        default=10,
        description="SQL query execution timeout in seconds",
        ge=1,
        le=60,
    )

    # ── Rate Limiting ──
    rate_limit: str = Field(
        default="30/minute",
        description="Rate limit per IP address",
    )

    # ── CORS ──
    allowed_origins: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of allowed CORS origins",
    )

    # ── Environment ──
    environment: str = Field(
        default="development",
        description="Current environment (development/staging/production)",
    )

    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
