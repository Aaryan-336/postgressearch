"""Schema introspector — extracts table/column/relationship metadata from user PostgreSQL databases.

Connects read-only to the user's database and queries information_schema
to build a complete schema map. Stores results in internal DB as TableMetadata.
Never reads or stores actual row data.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

import asyncpg
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schema_metadata import TableMetadata
from app.services.encryption import decrypt

logger = logging.getLogger(__name__)

# System schemas to exclude during introspection
EXCLUDED_SCHEMAS = {
    "pg_catalog",
    "information_schema",
    "pg_toast",
    "pg_temp_1",
    "pg_toast_temp_1",
}


async def introspect_database(
    session: AsyncSession,
    connection_id: UUID,
    host: str,
    port: str,
    database: str,
    username: str,
    password: str,
) -> list[TableMetadata]:
    """Introspect a user's PostgreSQL database and store schema metadata.

    Args:
        session: Internal DB session for storing results.
        connection_id: UUID of the connection record.
        host-password: Encrypted credentials (will be decrypted).

    Returns:
        List of TableMetadata objects created.
    """
    # Decrypt credentials
    dec_host = decrypt(host)
    dec_port = decrypt(port)
    dec_database = decrypt(database)
    dec_username = decrypt(username)
    dec_password = decrypt(password)

    logger.info(f"Introspecting database '{dec_database}' on {dec_host}:{dec_port}")

    # Connect to user's database with read-only intent
    conn = await asyncpg.connect(
        host=dec_host,
        port=int(dec_port),
        database=dec_database,
        user=dec_username,
        password=dec_password,
        timeout=15,
        server_settings={"default_transaction_read_only": "on"},
    )

    try:
        # Delete existing metadata for this connection (fresh introspection)
        await session.execute(
            delete(TableMetadata).where(TableMetadata.connection_id == connection_id)
        )

        # ── 1. Get all tables ──
        tables = await conn.fetch("""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
              AND table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            ORDER BY table_schema, table_name
        """)

        metadata_records: list[TableMetadata] = []

        for table in tables:
            schema_name = table["table_schema"]
            table_name = table["table_name"]

            if schema_name in EXCLUDED_SCHEMAS:
                continue

            # ── 2. Get columns ──
            columns_raw = await conn.fetch("""
                SELECT
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    c.column_default,
                    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku
                        ON tc.constraint_name = ku.constraint_name
                        AND tc.table_schema = ku.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema = $1
                      AND tc.table_name = $2
                ) pk ON c.column_name = pk.column_name
                WHERE c.table_schema = $1
                  AND c.table_name = $2
                ORDER BY c.ordinal_position
            """, schema_name, table_name)

            columns = [
                {
                    "name": col["column_name"],
                    "type": col["data_type"],
                    "nullable": col["is_nullable"] == "YES",
                    "is_pk": col["is_pk"],
                    "default": col["column_default"],
                }
                for col in columns_raw
            ]

            # ── 3. Get foreign key relationships ──
            fk_raw = await conn.fetch("""
                SELECT
                    kcu.column_name AS from_column,
                    ccu.table_schema AS to_schema,
                    ccu.table_name AS to_table,
                    ccu.column_name AS to_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = $1
                  AND tc.table_name = $2
            """, schema_name, table_name)

            relationships = [
                {
                    "from_column": fk["from_column"],
                    "to_table": f"{fk['to_schema']}.{fk['to_table']}" if fk["to_schema"] != "public" else fk["to_table"],
                    "to_column": fk["to_column"],
                    "type": "many_to_one",
                }
                for fk in fk_raw
            ]

            # Add FK reference info to columns
            fk_map = {fk["from_column"]: f"{fk['to_table']}" for fk in fk_raw}
            for col in columns:
                col["fk_ref"] = fk_map.get(col["name"])

            # ── 4. Get row count estimate ──
            row_count_result = await conn.fetchval("""
                SELECT n_live_tup
                FROM pg_stat_user_tables
                WHERE schemaname = $1 AND relname = $2
            """, schema_name, table_name)
            row_count = row_count_result or 0

            # ── 5. Auto-generate description ──
            col_names = [c["name"] for c in columns]
            description = (
                f"Table '{table_name}' in schema '{schema_name}' "
                f"with columns: {', '.join(col_names)}. "
                f"Approximately {row_count:,} rows."
            )

            # ── 6. Create metadata record ──
            metadata = TableMetadata(
                connection_id=connection_id,
                table_name=table_name,
                schema_name=schema_name,
                description=description,
                row_count_estimate=row_count,
                columns=columns,
                relationships=relationships,
            )
            session.add(metadata)
            metadata_records.append(metadata)

        await session.flush()
        logger.info(f"Introspected {len(metadata_records)} tables from '{dec_database}'")
        return metadata_records

    finally:
        await conn.close()
