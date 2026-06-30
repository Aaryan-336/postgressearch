"""Embedding service — generates and stores pgvector embeddings for schema metadata.

Uses Google text-embedding-004 model to create 768-dimensional embeddings
for table descriptions, column names, and relationship descriptions.
Embeddings are stored in the internal PostgreSQL database with pgvector.
"""

import logging
from uuid import UUID

from google import genai
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.embedding import SchemaEmbedding
from app.models.schema_metadata import TableMetadata

logger = logging.getLogger(__name__)

# Max texts per embedding API call
BATCH_SIZE = 100

# Embedding model
EMBEDDING_MODEL = "text-embedding-004"


def _get_genai_client() -> genai.Client:
    """Create a Google GenAI client."""
    settings = get_settings()
    return genai.Client(api_key=settings.gemini_api_key)


async def generate_embeddings_for_connection(
    session: AsyncSession,
    connection_id: UUID,
) -> int:
    """Generate embeddings for all schema metadata of a connection.

    Deletes existing embeddings and regenerates from current metadata.

    Args:
        session: Internal DB session.
        connection_id: UUID of the connection.

    Returns:
        Number of embeddings created.
    """
    # Delete existing embeddings for this connection
    await session.execute(
        delete(SchemaEmbedding).where(SchemaEmbedding.connection_id == connection_id)
    )

    # Fetch all table metadata for this connection
    result = await session.execute(
        select(TableMetadata).where(TableMetadata.connection_id == connection_id)
    )
    tables = result.scalars().all()

    if not tables:
        logger.warning(f"No table metadata found for connection {connection_id}")
        return 0

    # Prepare texts for embedding
    texts_to_embed: list[dict] = []

    for table in tables:
        # 1. Table description embedding
        texts_to_embed.append({
            "text": table.description or f"Table {table.table_name}",
            "content_type": "table_description",
            "source_table": table.table_name,
            "source_column": None,
        })

        # 2. Individual column embeddings
        columns = table.columns if isinstance(table.columns, list) else []
        for col in columns:
            col_name = col.get("name", "")
            col_type = col.get("type", "unknown")
            fk_ref = col.get("fk_ref")
            fk_text = f", references {fk_ref}" if fk_ref else ""

            col_text = (
                f"Column '{col_name}' in table '{table.table_name}' "
                f"of type {col_type}{fk_text}"
            )
            texts_to_embed.append({
                "text": col_text,
                "content_type": "column",
                "source_table": table.table_name,
                "source_column": col_name,
            })

        # 3. Relationship embeddings
        relationships = table.relationships if isinstance(table.relationships, list) else []
        for rel in relationships:
            rel_text = (
                f"Table '{table.table_name}' column '{rel.get('from_column')}' "
                f"references '{rel.get('to_table')}' column '{rel.get('to_column')}' "
                f"({rel.get('type', 'foreign key')} relationship)"
            )
            texts_to_embed.append({
                "text": rel_text,
                "content_type": "relationship",
                "source_table": table.table_name,
                "source_column": rel.get("from_column"),
            })

    # Generate embeddings
    settings = get_settings()
    has_valid_gemini = settings.gemini_api_key and "placeholder" not in settings.gemini_api_key.lower() and "here" not in settings.gemini_api_key.lower()

    embeddings_created = 0

    if not has_valid_gemini:
        logger.info("Using mock embeddings (no valid GEMINI_API_KEY found)")
        for item in texts_to_embed:
            schema_embedding = SchemaEmbedding(
                connection_id=connection_id,
                content=item["text"],
                content_type=item["content_type"],
                source_table=item["source_table"],
                source_column=item["source_column"],
                embedding=[0.0] * 768,
            )
            session.add(schema_embedding)
            embeddings_created += 1
    else:
        client = _get_genai_client()
        for i in range(0, len(texts_to_embed), BATCH_SIZE):
            batch = texts_to_embed[i : i + BATCH_SIZE]
            batch_texts = [item["text"] for item in batch]

            try:
                response = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=batch_texts,
                )

                for j, embedding_data in enumerate(response.embeddings):
                    item = batch[j]
                    schema_embedding = SchemaEmbedding(
                        connection_id=connection_id,
                        content=item["text"],
                        content_type=item["content_type"],
                        source_table=item["source_table"],
                        source_column=item["source_column"],
                        embedding=embedding_data.values,
                    )
                    session.add(schema_embedding)
                    embeddings_created += 1

            except Exception as e:
                logger.error(f"Embedding batch failed: {e}")
                raise

    await session.flush()
    logger.info(
        f"Created {embeddings_created} embeddings for connection {connection_id} "
        f"({len(tables)} tables)"
    )
    return embeddings_created
