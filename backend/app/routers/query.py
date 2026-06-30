"""Natural language query endpoint — the main user-facing search API.

Rate limited and logged. Never exposes SQL to the caller.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.schemas.query import QueryRequest, QueryResponse
from app.pipeline.query_pipeline import run_query_pipeline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["query"])

# Rate limiter instance — will be shared with the main app
limiter = Limiter(key_func=get_remote_address)


@router.post("/query", response_model=QueryResponse)
@limiter.limit(get_settings().rate_limit)
async def query_database(
    request: Request,
    body: QueryRequest,
    session: AsyncSession = Depends(get_session),
):
    """Execute a natural language query against a connected database.

    Pipeline:
    1. Prompt injection check
    2. Semantic search for relevant schema
    3. Gemini SQL generation
    4. Multi-layer SQL validation
    5. Read-only execution with timeout
    6. Return structured table data
    """
    try:
        # Convert Pydantic schema to service class if present
        user_context = None
        if body.user:
            from app.services.access_control import UserContext
            user_context = UserContext(
                email=body.user.email,
                role=body.user.role,
                department=body.user.department,
                location=body.user.location,
            )

        result = await run_query_pipeline(
            session=session,
            connection_id=body.connection_id,
            question=body.question,
            ip_address=get_remote_address(request),
            user=user_context,
        )
        return result

    except ValueError as e:
        if "permission" in str(e).lower() or "denied" in str(e).lower():
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={
                    "status": "denied",
                    "message": "You do not have permission to access this information."
                }
            )
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in query pipeline")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again.",
        )
