"""Semantic search service — finds relevant schema elements using pgvector similarity.

Embeds the user's natural language query and performs cosine similarity
search against stored schema embeddings to identify the most relevant
tables, columns, and relationships for SQL generation.
"""

import logging
from uuid import UUID

from google import genai
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-004"


def _get_genai_client() -> genai.Client:
    """Create a Google GenAI client."""
    settings = get_settings()
    return genai.Client(api_key=settings.gemini_api_key)


async def search_relevant_schema(
    session: AsyncSession,
    connection_id: UUID,
    query: str,
    top_k: int = 10,
) -> list[dict]:
    """Search for schema elements most relevant to the user's query.

    Args:
        session: Internal DB session.
        connection_id: UUID of the connection to search within.
        query: The user's natural language question.
        top_k: Number of top results to return.

    Returns:
        List of dicts with content, content_type, source_table,
        source_column, and similarity score.
    """
    # Embed the user's query
    settings = get_settings()
    has_valid_gemini = settings.gemini_api_key and "placeholder" not in settings.gemini_api_key.lower() and "here" not in settings.gemini_api_key.lower()

    if not has_valid_gemini:
        query_embedding = [0.0] * 768
    else:
        client = _get_genai_client()
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=[query],
        )
        query_embedding = response.embeddings[0].values

    # Perform cosine similarity search using pgvector
    # The <=> operator computes cosine distance (1 - similarity)
    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    result = await session.execute(
        text("""
            SELECT
                content,
                content_type,
                source_table,
                source_column,
                1 - (embedding <=> CAST(:query_embedding AS vector)) AS similarity
            FROM schema_embeddings
            WHERE connection_id = :connection_id
            ORDER BY embedding <=> CAST(:query_embedding AS vector)
            LIMIT :top_k
        """),
        {
            "query_embedding": embedding_str,
            "connection_id": str(connection_id),
            "top_k": top_k,
        },
    )

    rows = result.fetchall()

    results = [
        {
            "content": row.content,
            "content_type": row.content_type,
            "source_table": row.source_table,
            "source_column": row.source_column,
            "similarity": float(row.similarity),
        }
        for row in rows
    ]

    logger.info(
        f"Semantic search for '{query[:50]}...' returned {len(results)} results "
        f"(top similarity: {results[0]['similarity']:.3f})" if results else
        f"Semantic search for '{query[:50]}...' returned 0 results"
    )

    return results
