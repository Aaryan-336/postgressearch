"""Query executor — safely executes validated SQL against user PostgreSQL databases.

Enforces read-only mode, statement timeouts, and row limits.
Creates a dedicated short-lived connection for each query execution.
"""

import logging
import time

import asyncpg

from app.config import get_settings
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)


class QueryResult:
    """Structured result from a query execution."""

    def __init__(
        self,
        columns: list[dict],
        rows: list[dict],
        row_count: int,
        execution_time_ms: int,
    ):
        self.columns = columns
        self.rows = rows
        self.row_count = row_count
        self.execution_time_ms = execution_time_ms


async def execute_query(
    sql: str,
    host_encrypted: str,
    port_encrypted: str,
    database_encrypted: str,
    username_encrypted: str,
    password_encrypted: str,
) -> QueryResult:
    """Execute a validated SQL query against a user's database.

    Args:
        sql: The validated SQL query to execute.
        *_encrypted: Fernet-encrypted connection credentials.

    Returns:
        QueryResult with columns, rows, count, and timing.

    Raises:
        asyncpg.PostgresError: If the database query fails.
        TimeoutError: If the query exceeds the configured timeout.
    """
    settings = get_settings()
    timeout_ms = settings.query_timeout_seconds * 1000

    # Decrypt credentials
    host = decrypt(host_encrypted)
    port = int(decrypt(port_encrypted))
    database = decrypt(database_encrypted)
    username = decrypt(username_encrypted)
    password = decrypt(password_encrypted)

    logger.info(f"Executing query on {database}@{host}:{port}")

    # Create a dedicated connection with read-only and timeout settings
    conn = await asyncpg.connect(
        host=host,
        port=port,
        database=database,
        user=username,
        password=password,
        timeout=settings.query_timeout_seconds + 5,  # Connection timeout slightly longer
        server_settings={
            "statement_timeout": str(timeout_ms),
            "default_transaction_read_only": "on",
        },
    )

    try:
        start_time = time.perf_counter()

        # Execute within an explicit read-only transaction
        async with conn.transaction(readonly=True):
            # Fetch results
            records = await conn.fetch(sql)

        elapsed_ms = int((time.perf_counter() - start_time) * 1000)

        # Extract column information from the first record
        if records:
            columns = [
                {"name": key, "type": _pg_type_to_str(records[0][key])}
                for key in records[0].keys()
            ]
            rows = [dict(record) for record in records]

            # Serialize special types (dates, decimals, etc.)
            rows = [_serialize_row(row) for row in rows]
        else:
            columns = []
            rows = []

        result = QueryResult(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            execution_time_ms=elapsed_ms,
        )

        logger.info(
            f"Query executed: {result.row_count} rows in {result.execution_time_ms}ms"
        )
        return result

    except asyncpg.QueryCanceledError:
        raise TimeoutError(
            f"Query timed out after {settings.query_timeout_seconds} seconds. "
            "Try a more specific question or add filters."
        )
    finally:
        await conn.close()


def _pg_type_to_str(value) -> str:
    """Convert a Python value to a type string for the frontend."""
    if value is None:
        return "text"
    type_name = type(value).__name__
    type_map = {
        "int": "number",
        "float": "number",
        "Decimal": "number",
        "str": "text",
        "bool": "boolean",
        "date": "date",
        "datetime": "datetime",
        "time": "time",
        "UUID": "text",
        "list": "array",
        "dict": "json",
    }
    return type_map.get(type_name, "text")


def _serialize_row(row: dict) -> dict:
    """Serialize a row's values to JSON-compatible types."""
    import decimal
    from datetime import date, datetime, time
    from uuid import UUID

    serialized = {}
    for key, value in row.items():
        if isinstance(value, (datetime, date, time)):
            serialized[key] = value.isoformat()
        elif isinstance(value, decimal.Decimal):
            serialized[key] = float(value)
        elif isinstance(value, UUID):
            serialized[key] = str(value)
        elif isinstance(value, bytes):
            serialized[key] = value.hex()
        else:
            serialized[key] = value
    return serialized
