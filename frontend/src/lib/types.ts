/**
 * TypeScript type definitions for the NLPSearch application.
 * Mirrors the backend Pydantic schemas for type safety.
 */

// ── Connection Types ──

export interface ConnectionCreate {
  name: string;
  connection_string?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

export interface ConnectionResponse {
  id: string;
  name: string;
  is_active: boolean;
  last_introspected_at: string | null;
  table_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConnectionTestResponse {
  success: boolean;
  message: string;
  server_version?: string;
}

// ── Query Types ──

export interface QueryRequest {
  connection_id: string;
  question: string;
  user?: {
    email: string;
    role: string;
    department?: string;
    location?: string;
  };
}

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryResponse {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  row_count: number;
  explanation: string;
  execution_time_ms: number;
}

// ── Admin Types ──

export interface QueryLogEntry {
  id: string;
  connection_id: string | null;
  natural_language_query: string;
  generated_sql?: string;
  execution_time_ms: number | null;
  row_count: number | null;
  status: "success" | "error" | "blocked" | "timeout" | "pending";
  error_message: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface QueryLogListResponse {
  logs: QueryLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface SchemaMetadataResponse {
  connection_id: string;
  connection_name: string;
  tables: TableInfo[];
  total_tables: number;
  last_introspected_at: string | null;
}

export interface TableInfo {
  table_name: string;
  schema_name: string;
  description: string;
  row_count_estimate: number;
  columns: ColumnInfo[];
  relationships: RelationshipInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  is_pk: boolean;
  default: string | null;
  fk_ref: string | null;
}

export interface RelationshipInfo {
  from_column: string;
  to_table: string;
  to_column: string;
  type: string;
}

export interface AdminStats {
  total_queries: number;
  queries_today: number;
  avg_execution_time_ms: number;
  success_rate: number;
  active_connections: number;
  total_tables: number;
  blocked_queries: number;
}

export interface IntrospectResponse {
  message: string;
  tables_found: number;
  embeddings_created: number;
}

export interface EmbeddingRebuildResponse {
  connection_id: string;
  embeddings_created: number;
  tables_processed: number;
  message: string;
}
