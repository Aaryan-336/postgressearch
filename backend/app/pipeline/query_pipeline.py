"""Query pipeline — orchestrates the full natural language → SQL → results flow.

Pipeline steps:
1. Sanitize user input (prompt injection check)
2. Embed query → semantic search → retrieve relevant schema
3. Build schema context for LLM
4. Call Gemini → generate SQL + explanation
5. Validate SQL (multi-layer)
6. Execute against user DB (read-only, timeout)
7. Log query + return results
"""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import DatabaseConnection
from app.models.schema_metadata import TableMetadata
from app.models.query_log import QueryLog
from app.schemas.query import QueryResponse, QueryColumn
from app.services.sql_generator import generate_sql, check_prompt_injection
from app.services.sql_validator import validate_sql, SQLValidationError
from app.services.query_executor import execute_query
from app.services.semantic_search import search_relevant_schema

logger = logging.getLogger(__name__)


async def run_query_pipeline(
    session: AsyncSession,
    connection_id: UUID,
    question: str,
    ip_address: str | None = None,
    user: any = None,
) -> QueryResponse:
    """Run the full NL → SQL → results pipeline with RBAC and RLS/CLS guardrails.

    Args:
        session: Internal DB session for metadata access and logging.
        connection_id: UUID of the target database connection.
        question: The user's natural language question.
        ip_address: Client IP for audit logging.
        user: The authenticated user profile context.

    Returns:
        QueryResponse with columns, rows, explanation, and metrics.

    Raises:
        ValueError: If the question is invalid or blocked.
        RuntimeError: If the connection is not found or inactive.
    """
    from app.services.access_control import (
        UserContext,
        check_natural_language_intent,
        filter_metadata_for_user,
        get_role_config,
        get_row_filters_for_user,
        AccessDeniedError,
    )

    # Initialize default user if not provided
    if user is None:
        user = UserContext(email="anonymous@company.com", role="analyst")

    # Initialize query log entry
    query_log = QueryLog(
        connection_id=connection_id,
        natural_language_query=question,
        ip_address=ip_address,
        user_email=user.email,
        user_role=user.role,
        status="pending",
    )
    session.add(query_log)

    try:
        # ── Step 1: Prompt injection check ──
        injection_error = check_prompt_injection(question)
        if injection_error:
            query_log.status = "blocked"
            query_log.error_message = injection_error
            await session.flush()
            raise ValueError(injection_error)

        # ── Step 1b: Access Control Intent Check ──
        try:
            check_natural_language_intent(question, user)
        except AccessDeniedError as e:
            query_log.status = "blocked"
            query_log.error_message = e.message
            await session.flush()
            raise ValueError(e.message)

        # ── Step 2: Fetch connection details ──
        result = await session.execute(
            select(DatabaseConnection).where(
                DatabaseConnection.id == connection_id,
                DatabaseConnection.is_active == True,
            )
        )
        connection = result.scalar_one_or_none()

        if not connection:
            query_log.status = "error"
            query_log.error_message = "Connection not found or inactive"
            await session.flush()
            raise RuntimeError("Database connection not found or is inactive.")

        # ── Step 3: Semantic search for relevant schema ──
        search_results = await search_relevant_schema(
            session=session,
            connection_id=connection_id,
            query=question,
            top_k=10,
        )

        # ── Step 4: Build schema context from search results ──
        # Fetch full metadata for relevant tables
        relevant_tables = set()
        for result_item in search_results:
            relevant_tables.add(result_item["source_table"])

        # Check if mock embeddings are active (no valid Gemini API Key)
        from app.config import get_settings
        settings = get_settings()
        has_valid_gemini = settings.gemini_api_key and "placeholder" not in settings.gemini_api_key.lower() and "here" not in settings.gemini_api_key.lower()

        if not has_valid_gemini:
            # If using mock embeddings, bypass semantic search filtering and load ALL tables
            table_result = await session.execute(
                select(TableMetadata).where(
                    TableMetadata.connection_id == connection_id
                )
            )
            tables = list(table_result.scalars().all())
        elif relevant_tables:
            table_result = await session.execute(
                select(TableMetadata).where(
                    TableMetadata.connection_id == connection_id,
                    TableMetadata.table_name.in_(relevant_tables),
                )
            )
            tables = list(table_result.scalars().all())
        else:
            # Fallback: use all tables if semantic search returned nothing
            table_result = await session.execute(
                select(TableMetadata).where(
                    TableMetadata.connection_id == connection_id
                )
            )
            tables = list(table_result.scalars().all())

        # Filter schema metadata according to user role (CLS/table checks)
        filtered_tables = filter_metadata_for_user(tables, user)
        schema_context = _format_table_metadata(filtered_tables)

        # Resolve allowed/restricted metadata details for prompt parameters
        role_config = get_role_config(user.role)
        allowed_tbls = role_config["allowed_tables"]
        if allowed_tbls == "*":
            allowed_tbls = [t.table_name for t in tables]
            
        allowed_columns = []
        for t in tables:
            if t.table_name in allowed_tbls:
                rest_cols = role_config["restricted_columns"].get(t.table_name, [])
                cols_list = t.columns if isinstance(t.columns, list) else []
                for c in cols_list:
                    c_name = c.get("name", "")
                    if c_name and c_name not in rest_cols:
                        allowed_columns.append(f"{t.table_name}.{c_name}")
                        
        row_filters = get_row_filters_for_user(user)

        # ── Step 5: Generate SQL with Gemini ──
        gen_result = await generate_sql(
            question=question,
            schema_context=schema_context,
            user=user,
            allowed_tables=allowed_tbls,
            allowed_columns=allowed_columns,
            restricted_columns=role_config["restricted_columns"],
            row_filters=row_filters,
        )
        raw_sql = gen_result["sql"]
        explanation = gen_result["explanation"]

        # ── Step 6: Validate SQL ──
        try:
            validated_sql = validate_sql(raw_sql, user=user, all_tables_metadata=tables)
        except SQLValidationError as e:
            query_log.status = "blocked"
            query_log.generated_sql = raw_sql
            query_log.error_message = f"SQL validation failed: {e.message}"
            await session.flush()
            raise ValueError(f"Generated query was blocked for safety: {e.message}")

        query_log.generated_sql = validated_sql

        # ── Step 7: Execute query ──
        exec_result = await execute_query(
            sql=validated_sql,
            host_encrypted=connection.host_encrypted,
            port_encrypted=connection.port_encrypted,
            database_encrypted=connection.database_encrypted,
            username_encrypted=connection.username_encrypted,
            password_encrypted=connection.password_encrypted,
        )

        # ── Step 8: Update log and return results ──
        query_log.status = "success"
        query_log.execution_time_ms = exec_result.execution_time_ms
        query_log.row_count = exec_result.row_count
        await session.flush()

        return QueryResponse(
            columns=[
                QueryColumn(name=col["name"], type=col["type"])
                for col in exec_result.columns
            ],
            rows=exec_result.rows,
            row_count=exec_result.row_count,
            explanation=explanation,
            execution_time_ms=exec_result.execution_time_ms,
        )

    except (ValueError, RuntimeError):
        raise
    except TimeoutError as e:
        query_log.status = "timeout"
        query_log.error_message = str(e)
        await session.flush()
        raise ValueError(str(e))
    except Exception as e:
        query_log.status = "error"
        query_log.error_message = str(e)
        await session.flush()
        logger.exception(f"Pipeline error for question: {question[:100]}")
        raise ValueError(f"An error occurred while processing your question: {str(e)}")


def _build_schema_context(
    session: AsyncSession,
    connection_id: UUID,
    search_results: list[dict],
) -> str:
    """Build a schema context string from semantic search results."""
    if not search_results:
        return "No schema information available."

    lines = []
    for result in search_results:
        lines.append(
            f"- [{result['content_type']}] {result['content']} "
            f"(relevance: {result['similarity']:.2f})"
        )
    return "\n".join(lines)


def _format_table_metadata(tables: list[TableMetadata]) -> str:
    """Format table metadata into a readable schema context for the LLM."""
    if not tables:
        return "No tables found in the database."

    lines = []
    for table in tables:
        # Table header
        lines.append(f"\nTable: {table.schema_name}.{table.table_name}")
        lines.append(f"  Description: {table.description or 'No description'}")
        lines.append(f"  Approximate rows: {table.row_count_estimate:,}")

        # Columns
        columns = table.columns if isinstance(table.columns, list) else []
        if columns:
            lines.append("  Columns:")
            for col in columns:
                pk_marker = " [PK]" if col.get("is_pk") else ""
                fk_marker = f" → {col['fk_ref']}" if col.get("fk_ref") else ""
                nullable = " (nullable)" if col.get("nullable") else ""
                lines.append(
                    f"    - {col['name']}: {col.get('type', 'unknown')}"
                    f"{pk_marker}{fk_marker}{nullable}"
                )

        # Relationships
        relationships = table.relationships if isinstance(table.relationships, list) else []
        if relationships:
            lines.append("  Relationships:")
            for rel in relationships:
                lines.append(
                    f"    - {rel.get('from_column')} → "
                    f"{rel.get('to_table')}.{rel.get('to_column')} "
                    f"({rel.get('type', 'foreign key')})"
                )

    return "\n".join(lines)
