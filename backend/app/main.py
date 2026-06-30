"""FastAPI application entry point.

Configures the app with:
- Lifespan hooks for database engine management
- CORS middleware
- SlowAPI rate limiting
- Request logging
- Router registration
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import init_engine, dispose_engine, Base, get_engine
from app.routers import health, connections, query, admin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — initialize and cleanup resources."""
    # Startup
    logger.info("Starting NLPSearch API...")
    engine = init_engine()

    # Create tables if they don't exist (dev convenience)
    # In production, use Alembic migrations instead
    settings = get_settings()
    if settings.environment == "development":
        from sqlalchemy import text
        async with engine.begin() as conn:
            # Import all models so they register with Base
            import app.models  # noqa: F401
            await conn.run_sync(Base.metadata.create_all)
            
            # Ensure new columns exist on query_logs table
            try:
                await conn.execute(text("ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS user_email VARCHAR(255)"))
                await conn.execute(text("ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS user_role VARCHAR(50)"))
                logger.info("Database tables and audit columns ensured")
            except Exception as e:
                logger.warning(f"Could not check/alter query_logs table: {e}")

    logger.info("NLPSearch API started successfully")
    yield

    # Shutdown
    logger.info("Shutting down NLPSearch API...")
    await dispose_engine()
    logger.info("NLPSearch API shut down")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="NLPSearch API",
        description="AI-powered PostgreSQL natural language search",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url="/redoc" if settings.environment != "production" else None,
    )

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Rate Limiting ──
    from app.routers.query import limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Request Logging Middleware ──
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        logger.info(f"{request.method} {request.url.path}")
        response = await call_next(request)
        return response

    # ── Global Exception Handler ──
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.exception(f"Unhandled exception: {exc}")
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred."},
        )

    # ── Register Routers ──
    app.include_router(health.router)
    app.include_router(connections.router)
    app.include_router(query.router)
    app.include_router(admin.router)

    return app


# Create the app instance
app = create_app()
