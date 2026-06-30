"""SQL generator — uses Gemini 2.5 Flash to convert natural language to PostgreSQL SELECT queries.

Includes prompt injection defense, structured output, and explanation generation.
The LLM never receives raw database rows — only schema metadata.
"""

import json
import logging
import re

from google import genai
from google.genai import types

from app.config import get_settings

logger = logging.getLogger(__name__)

SQL_MODEL = "gemini-2.5-flash"

# ── Prompt injection patterns to reject BEFORE sending to LLM ──
INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions?", re.IGNORECASE),
    re.compile(r"ignore\s+(all\s+)?above\s+instructions?", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?previous", re.IGNORECASE),
    re.compile(r"forget\s+(all\s+)?previous", re.IGNORECASE),
    re.compile(r"show\s+(me\s+)?(the\s+)?passwords?", re.IGNORECASE),
    re.compile(r"reveal\s+(the\s+)?system\s+prompt", re.IGNORECASE),
    re.compile(r"what\s+(is|are)\s+(your|the)\s+system\s+(prompt|instructions?)", re.IGNORECASE),
    re.compile(r"drop\s+table", re.IGNORECASE),
    re.compile(r"delete\s+from", re.IGNORECASE),
    re.compile(r"truncate\s+table", re.IGNORECASE),
    re.compile(r"alter\s+table", re.IGNORECASE),
    re.compile(r"insert\s+into", re.IGNORECASE),
    re.compile(r"update\s+\w+\s+set", re.IGNORECASE),
    re.compile(r"grant\s+\w+", re.IGNORECASE),
    re.compile(r"revoke\s+\w+", re.IGNORECASE),
    re.compile(r"exec(ute)?\s*\(", re.IGNORECASE),
    re.compile(r";\s*--", re.IGNORECASE),
    re.compile(r"union\s+select.*from\s+(pg_|information_schema)", re.IGNORECASE),
    re.compile(r"pg_catalog", re.IGNORECASE),
    re.compile(r"pg_shadow", re.IGNORECASE),
    re.compile(r"pg_authid", re.IGNORECASE),
]


def check_prompt_injection(question: str) -> str | None:
    """Check for prompt injection patterns in the user's question.

    Returns:
        Error message if injection detected, None if clean.
    """
    for pattern in INJECTION_PATTERNS:
        if pattern.search(question):
            logger.warning(f"Prompt injection detected: '{question[:100]}'")
            return f"Your question contains a blocked pattern. Please rephrase your database question."
    return None


def _build_system_prompt(max_rows: int) -> str:
    """Build the system prompt for SQL generation with RBAC instructions."""
    return f"""You are a PostgreSQL SQL query generator for an enterprise database search system.

STRICT RULES — You must follow these without exception:
1. You ONLY generate SELECT statements. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, or EXECUTE.
2. You ALWAYS include LIMIT {max_rows} at the end of your query.
3. You NEVER access system tables: pg_catalog, information_schema, pg_shadow, pg_authid, pg_roles, pg_stat.
4. You NEVER include multiple SQL statements. Generate exactly ONE statement.
5. You NEVER include semicolons in your SQL output.
6. You generate valid PostgreSQL syntax only.
7. You MUST strictly apply row filters defined under ROW FILTERS to the relevant tables (e.g. employees.department = 'Finance') in the WHERE clause.
8. If the question refers to RESTRICTED COLUMNS or tables that are not in ALLOWED TABLES, you MUST NOT generate a query. Instead, return a denied response: {{"status": "denied", "message": "You do not have permission to access this information."}}

RESPONSE FORMAT:
You must respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.

{{"sql": "SELECT ...", "explanation": "A brief human-readable explanation of what this query does and what data it returns."}}"""


def _build_user_prompt(
    question: str,
    schema_context: str,
    user_role: str = "analyst",
    allowed_tables: str = "employees, departments, projects",
    allowed_columns: str = "all",
    restricted_columns: str = "none",
    row_filters: str = "none",
) -> str:
    """Build the user prompt with schema context and role constraints."""
    return f"""USER ROLE:
{user_role}

ALLOWED TABLES:
{allowed_tables}

ALLOWED COLUMNS:
{allowed_columns}

RESTRICTED COLUMNS:
{restricted_columns}

ROW FILTERS:
{row_filters}

DATABASE SCHEMA:
{schema_context}

USER QUESTION:
{question}

Generate the SQL query and explanation as JSON according to rules and limits."""


async def generate_sql(
    question: str,
    schema_context: str,
    user: any = None,
    allowed_tables: list[str] | None = None,
    allowed_columns: list[str] | None = None,
    restricted_columns: dict | None = None,
    row_filters: list[str] | None = None,
) -> dict:
    """Generate a SQL query from a natural language question.

    Args:
        question: The user's natural language question (already sanitized).
        schema_context: Relevant schema information from semantic search.
        user: UserContext details.
        allowed_tables: Allowed tables for the role.
        allowed_columns: Allowed columns for the role.
        restricted_columns: Restricted columns for the role.
        row_filters: Row level security filters for the role.

    Returns:
        Dict with 'sql' and 'explanation' keys.

    Raises:
        ValueError: If prompt injection is detected or generation fails.
    """
    # Check for prompt injection
    injection_error = check_prompt_injection(question)
    if injection_error:
        raise ValueError(injection_error)

    settings = get_settings()
    import httpx
    groq_api_key = settings.groq_api_key
    use_groq = groq_api_key and "placeholder" not in groq_api_key.lower() and len(groq_api_key.strip()) > 0

    # Format constraints as string representation for LLM prompt
    role_str = user.role if user else "analyst"
    allowed_tbls_str = ", ".join(allowed_tables) if allowed_tables else "employees, projects, departments"
    allowed_cols_str = ", ".join(allowed_columns) if allowed_columns else "all"
    
    rest_cols_list = []
    if restricted_columns:
        for t, cols in restricted_columns.items():
            for c in cols:
                rest_cols_list.append(f"{t}.{c}")
    rest_cols_str = ", ".join(rest_cols_list) if rest_cols_list else "none"
    row_fltrs_str = ", ".join(row_filters) if row_filters else "none"

    system_prompt = _build_system_prompt(settings.max_rows)
    user_prompt = _build_user_prompt(
        question=question,
        schema_context=schema_context,
        user_role=role_str,
        allowed_tables=allowed_tbls_str,
        allowed_columns=allowed_cols_str,
        restricted_columns=rest_cols_str,
        row_filters=row_fltrs_str,
    )

    try:
        if use_groq:
            logger.info("Generating SQL query using Groq API...")
            headers = {
                "Authorization": f"Bearer {groq_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }
            async with httpx.AsyncClient() as httpx_client:
                response = await httpx_client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=30.0
                )
                response.raise_for_status()
                res_json = response.json()
                raw_text = res_json["choices"][0]["message"]["content"]
        else:
            logger.info("Generating SQL query using Gemini API...")
            from google import genai
            client = genai.Client(api_key=settings.gemini_api_key)
            response = client.models.generate_content(
                model=SQL_MODEL,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.1,  # Low temperature for deterministic SQL
                    max_output_tokens=1024,
                ),
            )
            raw_text = response.text

        raw_text = raw_text.strip()

        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            # Remove first and last lines (code fences)
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw_text = "\n".join(lines).strip()

        # Parse JSON response
        try:
            result = json.loads(raw_text)
        except json.JSONDecodeError:
            # Try to extract SQL from plain text response
            logger.warning(f"Failed to parse JSON from LLM response, attempting extraction")
            # Look for a SELECT statement
            select_match = re.search(r"(SELECT\s+.+?)(?:;|\Z)", raw_text, re.IGNORECASE | re.DOTALL)
            if select_match:
                result = {
                    "sql": select_match.group(1).strip(),
                    "explanation": "Query generated from your question."
                }
            else:
                raise ValueError("Failed to generate a valid SQL query. Please rephrase your question.")

        # Check if LLM returned a denied response
        if result.get("status") == "denied":
            raise ValueError("You do not have permission to access this information.")

        sql = result.get("sql", "").strip()
        explanation = result.get("explanation", "Query generated from your question.")

        if not sql:
            raise ValueError("No SQL query was generated. Please rephrase your question.")

        # Remove trailing semicolons
        sql = sql.rstrip(";").strip()

        logger.info(f"Generated SQL for '{question[:50]}...': {sql[:100]}...")
        return {"sql": sql, "explanation": explanation}

    except Exception as e:
        if isinstance(e, ValueError):
            raise
        logger.error(f"LLM SQL generation failed: {e}")
        raise ValueError(f"Failed to generate SQL query: {str(e)}")
