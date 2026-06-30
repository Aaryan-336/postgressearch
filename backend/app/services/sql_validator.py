"""SQL validation engine — multi-layer security validation for generated SQL queries.

Ensures only safe SELECT statements are executed against user databases.
Validates at multiple levels: keyword analysis, statement structure,
system table access, LIMIT enforcement, and AST parsing.
"""

import logging
import re
from typing import Any

import sqlparse
from sqlparse.sql import Statement
from sqlparse.tokens import Keyword, DML

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Dangerous keywords that must NEVER appear in queries ──
DANGEROUS_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "CREATE", "GRANT", "REVOKE", "EXECUTE", "EXEC",
    "COPY", "VACUUM", "REINDEX", "CLUSTER", "COMMENT",
    "SECURITY", "OWNER", "REASSIGN", "REFRESH",
    "NOTIFY", "LISTEN", "UNLISTEN",
    "LOAD", "DEALLOCATE", "PREPARE",
    "SET ROLE", "RESET ROLE",
}

# ── System tables/schemas that must never be accessed ──
SYSTEM_TABLE_PATTERNS = [
    re.compile(r"\bpg_catalog\b", re.IGNORECASE),
    re.compile(r"\binformation_schema\b", re.IGNORECASE),
    re.compile(r"\bpg_stat\w*\b", re.IGNORECASE),
    re.compile(r"\bpg_shadow\b", re.IGNORECASE),
    re.compile(r"\bpg_authid\b", re.IGNORECASE),
    re.compile(r"\bpg_roles\b", re.IGNORECASE),
    re.compile(r"\bpg_user\b", re.IGNORECASE),
    re.compile(r"\bpg_database\b", re.IGNORECASE),
    re.compile(r"\bpg_tablespace\b", re.IGNORECASE),
    re.compile(r"\bpg_settings\b", re.IGNORECASE),
    re.compile(r"\bpg_file_\w+\b", re.IGNORECASE),
    re.compile(r"\bpg_read_\w+\b", re.IGNORECASE),
    re.compile(r"\bpg_write_\w+\b", re.IGNORECASE),
    re.compile(r"\bpg_ls_\w+\b", re.IGNORECASE),
]

# ── Dangerous function patterns ──
DANGEROUS_FUNCTIONS = [
    re.compile(r"\bpg_read_file\s*\(", re.IGNORECASE),
    re.compile(r"\bpg_write_file\s*\(", re.IGNORECASE),
    re.compile(r"\bpg_ls_dir\s*\(", re.IGNORECASE),
    re.compile(r"\bpg_stat_file\s*\(", re.IGNORECASE),
    re.compile(r"\bpg_terminate_backend\s*\(", re.IGNORECASE),
    re.compile(r"\bpg_cancel_backend\s*\(", re.IGNORECASE),
    re.compile(r"\bpg_reload_conf\s*\(", re.IGNORECASE),
    re.compile(r"\bpg_sleep\s*\(", re.IGNORECASE),
    re.compile(r"\bdblink\s*\(", re.IGNORECASE),
    re.compile(r"\blo_import\s*\(", re.IGNORECASE),
    re.compile(r"\blo_export\s*\(", re.IGNORECASE),
    re.compile(r"\bcopy\s+", re.IGNORECASE),
]


class SQLValidationError(Exception):
    """Raised when SQL validation fails."""

    def __init__(self, message: str, violation_type: str):
        self.message = message
        self.violation_type = violation_type
        super().__init__(message)


def validate_sql(
    sql: str,
    user: Any = None,
    all_tables_metadata: list[Any] | None = None
) -> str:
    """Validate a SQL query through multiple security layers.

    Args:
        sql: The SQL query to validate.

    Returns:
        The validated (and possibly modified) SQL query.

    Raises:
        SQLValidationError: If the query fails any validation check.
    """
    if not sql or not sql.strip():
        raise SQLValidationError("Empty SQL query", "empty")

    sql = sql.strip()

    # ── Layer 1: Remove trailing semicolons ──
    sql = sql.rstrip(";").strip()

    # ── Layer 2: Check for multiple statements ──
    parsed_statements = sqlparse.parse(sql)
    # Filter out empty/whitespace-only statements
    real_statements = [s for s in parsed_statements if s.tokens and str(s).strip()]
    if len(real_statements) > 1:
        raise SQLValidationError(
            "Multiple SQL statements are not allowed. Please ask one question at a time.",
            "multiple_statements",
        )

    if not real_statements:
        raise SQLValidationError("No valid SQL statement found.", "empty")

    statement = real_statements[0]

    # ── Layer 3: Verify it's a SELECT statement ──
    stmt_type = statement.get_type()
    if stmt_type and stmt_type.upper() != "SELECT":
        raise SQLValidationError(
            f"Only SELECT queries are allowed. Detected: {stmt_type}",
            "non_select",
        )

    # Also check the first meaningful token
    sql_upper = sql.upper().strip()
    first_keyword = sql_upper.split()[0] if sql_upper.split() else ""

    # Allow WITH (CTE) as it precedes SELECT
    if first_keyword not in ("SELECT", "WITH"):
        raise SQLValidationError(
            f"Query must start with SELECT or WITH. Found: {first_keyword}",
            "non_select",
        )

    # ── Layer 4: Check for dangerous keywords ──
    # Tokenize and check each word
    tokens = re.findall(r'\b[A-Z_]+\b', sql_upper)
    for token in tokens:
        if token in DANGEROUS_KEYWORDS:
            raise SQLValidationError(
                f"Dangerous keyword '{token}' is not allowed in queries.",
                "dangerous_keyword",
            )

    # Also check multi-word dangerous patterns
    for pattern in [
        re.compile(r"\bSET\s+ROLE\b", re.IGNORECASE),
        re.compile(r"\bRESET\s+ROLE\b", re.IGNORECASE),
        re.compile(r"\bINTO\s+OUTFILE\b", re.IGNORECASE),
        re.compile(r"\bINTO\s+DUMPFILE\b", re.IGNORECASE),
    ]:
        if pattern.search(sql):
            raise SQLValidationError(
                "Query contains a blocked operation pattern.",
                "dangerous_pattern",
            )

    # ── Layer 5: Check for system table access ──
    for pattern in SYSTEM_TABLE_PATTERNS:
        if pattern.search(sql):
            raise SQLValidationError(
                "Access to system tables is not allowed.",
                "system_table",
            )

    # ── Layer 6: Check for dangerous functions ──
    for pattern in DANGEROUS_FUNCTIONS:
        if pattern.search(sql):
            raise SQLValidationError(
                "Dangerous database function detected and blocked.",
                "dangerous_function",
            )

    # ── Layer 7: Check subquery depth ──
    max_depth = 3
    depth = 0
    max_found = 0
    for char in sql:
        if char == "(":
            depth += 1
            max_found = max(max_found, depth)
        elif char == ")":
            depth -= 1

    if max_found > max_depth:
        raise SQLValidationError(
            f"Query nesting depth ({max_found}) exceeds maximum ({max_depth}).",
            "nesting_depth",
        )

    # ── Layer 8: Enforce LIMIT ──
    settings = get_settings()
    max_rows = settings.max_rows

    # Check if LIMIT exists
    limit_match = re.search(r"\bLIMIT\s+(\d+)", sql, re.IGNORECASE)
    if limit_match:
        limit_value = int(limit_match.group(1))
        if limit_value > max_rows:
            # Replace with max allowed
            sql = re.sub(
                r"\bLIMIT\s+\d+",
                f"LIMIT {max_rows}",
                sql,
                flags=re.IGNORECASE,
            )
            logger.info(f"Reduced LIMIT from {limit_value} to {max_rows}")
    else:
        # Add LIMIT if missing
        sql = f"{sql}\nLIMIT {max_rows}"
        logger.info(f"Added LIMIT {max_rows} to query")

    # ── Layer 9: Check for comment-based injection ──
    if "--" in sql or "/*" in sql:
        raise SQLValidationError(
            "SQL comments are not allowed in queries.",
            "sql_comments",
        )

    # ── Layer 10: Role-based Table and Column Level Security Check ──
    if user is not None and all_tables_metadata is not None:
        from app.services.access_control import validate_generated_sql, AccessDeniedError, inject_row_filters
        try:
            sql = inject_row_filters(sql, user)
            validate_generated_sql(sql, user, all_tables_metadata)
        except AccessDeniedError as e:
            raise SQLValidationError(e.message, "access_denied")

    logger.info(f"SQL validation passed: {sql[:100]}...")
    return sql
