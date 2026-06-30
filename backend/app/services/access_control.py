"""Access Control Service — enforces role-based, column-level, and row-level security.

Provides pre-query validation, post-query SQL validation, context filtering, and RLS policy generation.
"""

import logging
import re
from pydantic import BaseModel
from app.models.schema_metadata import TableMetadata

logger = logging.getLogger(__name__)

# Pydantic schema for User Context
class UserContext(BaseModel):
    email: str
    role: str
    department: str | None = None
    location: str | None = None

# Role Permission Mapping Configuration
ROLE_PERMISSIONS = {
    "intern": {
        "allowed_tables": ["employees", "departments"],
        "restricted_columns": {
            "employees": ["salary", "bonus", "bank_account"]
        },
        "row_filters": []  # No row filters, just restricted tables/cols
    },
    "analyst": {
        "allowed_tables": ["employees", "projects", "departments"],
        "restricted_columns": {
            "employees": ["salary", "bonus", "bank_account"]
        },
        "row_filters": []  # No row filters
    },
    "manager": {
        "allowed_tables": [
            "employees", "projects", "departments", 
            "transactions", "financial_records", 
            "relationship_managers", "clients", "incentives"
        ],
        "restricted_columns": {},
        # Row filter checks for department matching user's department
        "row_filters": [
            {
                "table": "employees",
                "filter_column": "department",
                "user_property": "department"
            }
        ]
    },
    "director": {
        "allowed_tables": [
            "employees", "projects", "departments", 
            "transactions", "financial_records", 
            "relationship_managers", "clients", "incentives"
        ],
        "restricted_columns": {},
        # Row filter checks for location or region matching user's location
        "row_filters": [
            {
                "table": "employees",
                "filter_column": "location",
                "user_property": "location"
            }
        ]
    },
    "admin": {
        "allowed_tables": "*",  # Wildcard allowing all tables
        "restricted_columns": {},
        "row_filters": []
    }
}

class AccessDeniedError(Exception):
    """Exception raised when access control policies are violated."""
    def __init__(self, message: str = "You do not have permission to access this information."):
        self.message = message
        super().__init__(message)


def get_role_config(role: str) -> dict:
    """Get the permission configuration for a user role, case-insensitively."""
    role_key = role.lower().strip()
    # Default to intern-like minimal access if role is unrecognized
    return ROLE_PERMISSIONS.get(role_key, ROLE_PERMISSIONS["intern"])


def check_natural_language_intent(question: str, user: UserContext) -> None:
    """Scan the natural language question for restricted keywords before calling the LLM.

    If a violation is found, raises AccessDeniedError immediately.
    """
    if user.role.lower().strip() == "admin":
        return

    config = get_role_config(user.role)
    question_lower = question.lower()

    # 1. Check table access intent
    if config["allowed_tables"] != "*":
        # Check if the user is asking about an unauthorized table
        all_known_tables = [
            "employees", "projects", "departments", 
            "transactions", "financial_records", 
            "relationship_managers", "clients", "incentives"
        ]
        for table in all_known_tables:
            if table not in config["allowed_tables"]:
                # If table name appears as a word, reject
                if re.search(rf"\b{table}\b", question_lower):
                    logger.warning(f"Access Denied: Role {user.role} requested unauthorized table '{table}' in prompt: '{question}'")
                    raise AccessDeniedError()

    # 2. Check restricted column access intent (matching common plural and base variations)
    column_variants = {
        "salary": [r"\bsalar(y|ies)\b"],
        "bonus": [r"\bbonus(es)?\b"],
        "bank_account": [r"\bbank\b", r"\baccount(s)?\b", r"\bbank_account(s)?\b"]
    }

    for table, restricted_cols in config["restricted_columns"].items():
        for col in restricted_cols:
            # Check default word boundary
            if re.search(rf"\b{col}\b", question_lower):
                logger.warning(f"Access Denied: Role {user.role} requested restricted column '{col}' of table '{table}' in prompt: '{question}'")
                raise AccessDeniedError()
            
            # Check variants (like plurals)
            variants = column_variants.get(col.lower(), [])
            for variant_pattern in variants:
                if re.search(variant_pattern, question_lower):
                    logger.warning(f"Access Denied: Role {user.role} requested restricted column '{col}' (variant match) of table '{table}' in prompt: '{question}'")
                    raise AccessDeniedError()


def filter_metadata_for_user(tables: list[TableMetadata], user: UserContext) -> list[TableMetadata]:
    """Filter table and column metadata to ONLY include what the user is allowed to access.

    This ensures the LLM never sees unauthorized schema context.
    """
    config = get_role_config(user.role)
    if config["allowed_tables"] == "*":
        return tables

    allowed_tables = config["allowed_tables"]
    restricted_columns = config["restricted_columns"]

    filtered_tables = []
    for table in tables:
        # Check table authorization
        if table.table_name.lower() not in allowed_tables:
            continue

        # Check column authorization
        table_restricted = restricted_columns.get(table.table_name.lower(), [])
        
        # Make a copy of table columns list, excluding restricted columns
        cols_list = table.columns if isinstance(table.columns, list) else []
        filtered_cols = [
            col for col in cols_list
            if col.get("name", "").lower() not in table_restricted
        ]
        
        # Clone or mock TableMetadata with filtered columns
        # To avoid modifying DB model directly, we construct a temp object
        temp_table = TableMetadata(
            table_name=table.table_name,
            schema_name=table.schema_name,
            description=table.description,
            row_count_estimate=table.row_count_estimate,
            columns=filtered_cols,
            relationships=table.relationships
        )
        filtered_tables.append(temp_table)

    return filtered_tables


def get_row_filters_for_user(user: UserContext) -> list[str]:
    """Get formatting strings for row filters applicable to the user's context."""
    config = get_role_config(user.role)
    filters = []
    
    for rf in config.get("row_filters", []):
        val = getattr(user, rf["user_property"], None)
        if val:
            filters.append(f"{rf['table']}.{rf['filter_column']} = '{val}'")
            
    return filters


def inject_row_filters(sql: str, user: UserContext) -> str:
    """Ensure required row filters are present in the SQL query by injecting them if missing."""
    if user.role.lower().strip() == "admin":
        return sql

    config = get_role_config(user.role)
    sql_lower = sql.lower()

    for rf in config.get("row_filters", []):
        val = getattr(user, rf["user_property"], None)
        if not val:
            continue
        
        table = rf["table"]
        col = rf["filter_column"]
        filter_clause = f"{table}.{col} = '{val}'"
        
        # Check if table is referenced in the query
        if re.search(rf"\b{table}\b", sql_lower):
            # Check if the filter column and value pattern is already present in the SQL
            clean_filter = f"{col}={val}".lower().replace(" ", "")
            clean_sql = sql_lower.replace(" ", "").replace("'", "").replace("\"", "")
            
            if clean_filter not in clean_sql:
                logger.info(f"Injecting missing RLS filter '{filter_clause}' into query")
                # Check if WHERE exists
                where_match = re.search(r"\bWHERE\b", sql, re.IGNORECASE)
                if where_match:
                    # Inject right after WHERE
                    idx = where_match.end()
                    sql = sql[:idx] + f" {filter_clause} AND" + sql[idx:]
                else:
                    # Inject before LIMIT, ORDER BY, GROUP BY, or at the end
                    suffix_match = re.search(r"\b(LIMIT|ORDER\s+BY|GROUP\s+BY)\b", sql, re.IGNORECASE)
                    if suffix_match:
                        idx = suffix_match.start()
                        sql = sql[:idx] + f"WHERE {filter_clause} " + sql[idx:]
                    else:
                        sql = f"{sql} WHERE {filter_clause}"
                
                # Refresh sql_lower for subsequent filters
                sql_lower = sql.lower()
                
    return sql


def validate_generated_sql(sql: str, user: UserContext, all_tables_metadata: list[TableMetadata]) -> None:
    """Verify that the generated SQL query complies with all access control rules.

    Regex scans the SQL query string for restricted tables and columns.
    If a violation is found, raises AccessDeniedError.
    """
    if user.role.lower().strip() == "admin":
        return

    config = get_role_config(user.role)
    sql_lower = sql.lower()

    # 1. Enforce table restrictions
    if config["allowed_tables"] != "*":
        allowed = config["allowed_tables"]
        # Any other table metadata found in DB that is not allowed should not be in the SQL
        for meta in all_tables_metadata:
            t_name = meta.table_name.lower()
            if t_name not in allowed:
                # If unauthorized table appears in query text, block it
                if re.search(rf"\b{t_name}\b", sql_lower):
                    logger.warning(f"Access Denied: Generated SQL references forbidden table '{t_name}': {sql}")
                    raise AccessDeniedError()

    # 2. Enforce column restrictions
    restricted_columns = config["restricted_columns"]
    for table, columns in restricted_columns.items():
        for col in columns:
            if re.search(rf"\b{col}\b", sql_lower):
                logger.warning(f"Access Denied: Generated SQL references restricted column '{col}' of table '{table}': {sql}")
                raise AccessDeniedError()

    # 3. Enforce RLS row filters presence
    # Check that required filters are syntactically present in the query
    row_filters = get_row_filters_for_user(user)
    for filter_clause in row_filters:
        # e.g., filter_clause = "employees.department = 'Finance'"
        # Check if the filter column or pattern is in the SQL query
        col_part = filter_clause.split("=")[0].strip()
        col_name = col_part.split(".")[-1]
        
        # Verify the filter is in the WHERE clause of the SQL
        # As a safe guardrail, if the table is referenced, the filter MUST be present in the query text.
        # Check if table (e.g. employees) is referenced
        table_part = col_part.split(".")[0]
        if re.search(rf"\b{table_part}\b", sql_lower):
            # The filter condition must be in the query
            clean_filter = filter_clause.replace(" ", "").replace("'", "").lower()
            clean_sql = sql_lower.replace(" ", "").replace("'", "").replace("\"", "")
            
            # Simple check: column name and value should be in SQL (e.g. department=finance)
            val_part = filter_clause.split("=")[1].strip().strip("'").lower()
            expected_pattern = f"{col_name}={val_part}"
            if expected_pattern not in clean_sql:
                logger.warning(f"Access Denied: Generated SQL missing required RLS filter '{filter_clause}': {sql}")
                raise AccessDeniedError()


def generate_rls_policies(connection_name: str, tables: list[TableMetadata]) -> str:
    """Generate PostgreSQL Row Level Security (RLS) policies for the database.

    Returns the CREATE POLICY SQL script matching the active application roles.
    """
    sql_lines = [
        f"-- ── PostgreSQL Row Level Security Policies for '{connection_name}' ──",
        "-- Enable RLS on core tables",
        "ALTER TABLE employees ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE projects ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE departments ENABLE ROW LEVEL SECURITY;",
        ""
    ]

    # Generate Manager policy (Department constraint)
    sql_lines.extend([
        "-- Manager Policy: Managers can only view rows matching their department",
        "DROP POLICY IF EXISTS manager_employee_policy ON employees;",
        "CREATE POLICY manager_employee_policy ON employees",
        "    FOR SELECT",
        "    USING (department = current_setting('app.current_user_department', true));",
        ""
    ])

    # Generate Director / Regional Head policy (Location constraint)
    sql_lines.extend([
        "-- Director Policy: Directors can only view rows matching their location/region",
        "DROP POLICY IF EXISTS director_employee_policy ON employees;",
        "CREATE POLICY director_employee_policy ON employees",
        "    FOR SELECT",
        "    USING (location = current_setting('app.current_user_location', true));",
        ""
    ])

    # Generate Intern/Analyst column-level restrictions comments
    sql_lines.extend([
        "-- Note on Column Level Security (CLS):",
        "-- In PostgreSQL, CLS can be enforced by creating views or using GRANT SELECT on specific columns.",
        "-- Example to restrict Intern/Analyst from viewing salary/bonus/bank_account:",
        "-- CREATE ROLE intern_role;",
        "-- GRANT SELECT (id, name, department, joining_date) ON employees TO intern_role;",
        "-- GRANT SELECT ON departments TO intern_role;",
        ""
    ])

    return "\n".join(sql_lines)
