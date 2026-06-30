"""Pydantic schemas for natural language query requests and responses."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class UserContextSchema(BaseModel):
    """User profile details context for role-based permissions and filters."""
    email: str
    role: str
    department: str | None = None
    location: str | None = None


class QueryRequest(BaseModel):
    """Request body for a natural language database query."""

    connection_id: UUID = Field(
        ..., description="ID of the database connection to query"
    )
    question: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Natural language question about the database",
        examples=[
            "Show all employees who joined in 2020",
            "Which clients have AUM above 5 crore?",
            "Give me the top 10 advisors by revenue",
        ],
    )
    user: UserContextSchema | None = Field(
        default=None,
        description="Simulated user profile for enterprise access control and row level filters"
    )


class QueryColumn(BaseModel):
    """Describes a column in the query results."""

    name: str
    type: str = "text"


class QueryResponse(BaseModel):
    """Response body for a natural language query — returns structured table data."""

    columns: list[QueryColumn] = Field(
        description="Column definitions for the result table"
    )
    rows: list[dict[str, Any]] = Field(
        description="Result rows as list of column-value dictionaries"
    )
    row_count: int = Field(
        description="Total number of rows returned"
    )
    explanation: str = Field(
        description="Human-readable explanation of what the query found"
    )
    execution_time_ms: int = Field(
        description="Query execution time in milliseconds"
    )
