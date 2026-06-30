/**
 * Backend API client for NLPSearch.
 * All requests go through this module — never call fetch directly.
 */

import type {
  ConnectionCreate,
  ConnectionResponse,
  ConnectionTestResponse,
  QueryRequest,
  QueryResponse,
  QueryLogListResponse,
  SchemaMetadataResponse,
  AdminStats,
  IntrospectResponse,
  EmbeddingRebuildResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(
      errorBody.detail || `Request failed with status ${res.status}`,
      res.status
    );
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

function adminHeaders(): Record<string, string> {
  // Admin key is only used server-side or from admin pages
  const adminKey =
    typeof window !== "undefined"
      ? localStorage.getItem("nlpsearch_admin_key") || ""
      : "";
  return { "X-Admin-Key": adminKey };
}

// ── Connection API ──

export async function createConnection(
  data: ConnectionCreate
): Promise<ConnectionResponse> {
  return request<ConnectionResponse>("/api/connections", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listConnections(): Promise<ConnectionResponse[]> {
  return request<ConnectionResponse[]>("/api/connections");
}

export async function getConnection(
  id: string
): Promise<ConnectionResponse> {
  return request<ConnectionResponse>(`/api/connections/${id}`);
}

export async function deleteConnection(id: string): Promise<void> {
  return request<void>(`/api/connections/${id}`, {
    method: "DELETE",
  });
}

export async function testConnection(
  id: string
): Promise<ConnectionTestResponse> {
  return request<ConnectionTestResponse>(`/api/connections/${id}/test`, {
    method: "POST",
  });
}

export async function introspectConnection(
  id: string
): Promise<IntrospectResponse> {
  return request<IntrospectResponse>(`/api/connections/${id}/introspect`, {
    method: "POST",
  });
}

// ── Query API ──

export async function queryDatabase(
  data: QueryRequest
): Promise<QueryResponse> {
  return request<QueryResponse>("/api/query", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Admin API ──

export async function getAdminStats(): Promise<AdminStats> {
  return request<AdminStats>("/api/admin/stats", {
    headers: adminHeaders(),
  });
}

export async function getQueryLogs(params: {
  page?: number;
  page_size?: number;
  connection_id?: string;
  status_filter?: string;
}): Promise<QueryLogListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.page_size)
    searchParams.set("page_size", String(params.page_size));
  if (params.connection_id)
    searchParams.set("connection_id", params.connection_id);
  if (params.status_filter)
    searchParams.set("status_filter", params.status_filter);

  return request<QueryLogListResponse>(
    `/api/admin/logs?${searchParams.toString()}`,
    { headers: adminHeaders() }
  );
}

export async function getQuerySql(
  logId: string
): Promise<{
  id: string;
  natural_language_query: string;
  generated_sql: string | null;
  status: string;
  error_message: string | null;
}> {
  return request(`/api/admin/logs/${logId}/sql`, {
    headers: adminHeaders(),
  });
}

export async function getSchemaMetadata(
  connectionId: string
): Promise<SchemaMetadataResponse> {
  return request<SchemaMetadataResponse>(
    `/api/admin/schema/${connectionId}`,
    { headers: adminHeaders() }
  );
}

export async function refreshSchema(
  connectionId: string
): Promise<{ message: string; tables_found: number }> {
  return request(`/api/admin/schema/${connectionId}/refresh`, {
    method: "POST",
    headers: adminHeaders(),
  });
}

export async function rebuildEmbeddings(
  connectionId: string
): Promise<EmbeddingRebuildResponse> {
  return request<EmbeddingRebuildResponse>(
    `/api/admin/embeddings/${connectionId}/rebuild`,
    {
      method: "POST",
      headers: adminHeaders(),
    }
  );
}

export { ApiError };
