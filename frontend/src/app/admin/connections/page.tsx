"use client";

import { useState, useEffect } from "react";
import {
  listConnections,
  deleteConnection,
  testConnection,
  introspectConnection,
} from "@/lib/api";
import type { ConnectionResponse } from "@/lib/types";
import Header from "@/components/layout/header";
import { formatDate } from "@/lib/utils";

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const data = await listConnections();
      setConnections(data);
    } catch (err) {
      console.error("Failed to load connections:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadConnections();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleTest = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await testConnection(id);
      setMessage({
        type: result.success ? "success" : "error",
        text: result.message,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleIntrospect = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await introspectConnection(id);
      setMessage({
        type: "success",
        text: `Found ${result.tables_found} tables, created ${result.embeddings_created} embeddings`,
      });
      await loadConnections();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Introspection failed",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete connection "${name}"? This cannot be undone.`)) return;
    try {
      await deleteConnection(id);
      setMessage({ type: "success", text: `Connection "${name}" deleted` });
      // Clear if it was the active connection
      if (localStorage.getItem("nlpsearch_connection_id") === id) {
        localStorage.removeItem("nlpsearch_connection_id");
      }
      await loadConnections();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
    }
  };

  const handleSetActive = (id: string) => {
    localStorage.setItem("nlpsearch_connection_id", id);
    setMessage({ type: "success", text: "Active connection updated" });
  };

  const activeConnectionId =
    typeof window !== "undefined"
      ? localStorage.getItem("nlpsearch_connection_id")
      : null;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Connections</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Manage your database connections
            </p>
          </div>
          <a
            href="/setup"
            className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-all shadow-md shadow-purple-500/20"
          >
            + Add Connection
          </a>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm mb-4 animate-fade-in ${
              message.type === "success"
                ? "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20"
                : "bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20"
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="glass-subtle p-6 h-32 animate-shimmer rounded-xl"
              />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="glass-subtle p-12 text-center">
            <p className="text-[var(--text-secondary)] mb-4">
              No connections yet.
            </p>
            <a
              href="/setup"
              className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              Add your first connection →
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className={`glass-subtle p-5 rounded-xl animate-fade-in ${
                  activeConnectionId === conn.id
                    ? "ring-1 ring-[var(--accent)] shadow-[var(--shadow-glow)]"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{conn.name}</h3>
                      {activeConnectionId === conn.id && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent)]/15 text-[var(--accent)]">
                          ACTIVE
                        </span>
                      )}
                      <span
                        className={`w-2 h-2 rounded-full ${
                          conn.is_active
                            ? "bg-[var(--success)]"
                            : "bg-[var(--error)]"
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-secondary)]">
                      <span>{conn.table_count} tables</span>
                      {conn.last_introspected_at && (
                        <span>
                          Last scanned:{" "}
                          {formatDate(conn.last_introspected_at)}
                        </span>
                      )}
                      <span>Created: {formatDate(conn.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {activeConnectionId !== conn.id && (
                      <button
                        onClick={() => handleSetActive(conn.id)}
                        className="px-3 py-1.5 rounded-lg text-xs bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all cursor-pointer"
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={actionLoading === conn.id}
                      className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleIntrospect(conn.id)}
                      disabled={actionLoading === conn.id}
                      className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      Refresh Schema
                    </button>
                    <button
                      onClick={() => handleDelete(conn.id, conn.name)}
                      className="px-3 py-1.5 rounded-lg text-xs text-[var(--error)] hover:bg-[var(--error)]/10 transition-all cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
