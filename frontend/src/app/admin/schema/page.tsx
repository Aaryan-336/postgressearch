"use client";

import { useState, useEffect } from "react";
import {
  listConnections,
  getSchemaMetadata,
  refreshSchema,
  rebuildEmbeddings,
} from "@/lib/api";
import type { ConnectionResponse, SchemaMetadataResponse } from "@/lib/types";
import Header from "@/components/layout/header";
import { formatNumber } from "@/lib/utils";

export default function SchemaPage() {
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaMetadataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listConnections();
        setConnections(data);
        if (data.length > 0) {
          setSelectedConnId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load connections:", err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedConnId) return;
    const loadSchema = async () => {
      setLoading(true);
      try {
        const data = await getSchemaMetadata(selectedConnId);
        setSchema(data);
      } catch (err) {
        console.error("Failed to load schema:", err);
      } finally {
        setLoading(false);
      }
    };
    loadSchema();
  }, [selectedConnId]);

  const handleRefresh = async () => {
    if (!selectedConnId) return;
    setActionLoading(true);
    try {
      const result = await refreshSchema(selectedConnId);
      setMessage({
        type: "success",
        text: `Schema refreshed: ${result.tables_found} tables found`,
      });
      // Reload
      const data = await getSchemaMetadata(selectedConnId);
      setSchema(data);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Refresh failed",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRebuildEmbeddings = async () => {
    if (!selectedConnId) return;
    setActionLoading(true);
    try {
      const result = await rebuildEmbeddings(selectedConnId);
      setMessage({
        type: "success",
        text: `Rebuilt ${result.embeddings_created} embeddings across ${result.tables_processed} tables`,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Rebuild failed",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Schema Explorer</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              View tables, columns, and relationships
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Connection selector */}
            <select
              value={selectedConnId || ""}
              onChange={(e) => setSelectedConnId(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleRefresh}
              disabled={actionLoading}
              className="px-4 py-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border)] text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              ↻ Refresh Schema
            </button>

            <button
              onClick={handleRebuildEmbeddings}
              disabled={actionLoading}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-all shadow-md shadow-purple-500/20 cursor-pointer disabled:opacity-50"
            >
              ⟳ Rebuild Embeddings
            </button>
          </div>
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
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass-subtle p-6 h-20 animate-shimmer rounded-xl" />
            ))}
          </div>
        ) : schema ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {schema.total_tables} tables in{" "}
              <span className="text-[var(--text-primary)] font-medium">
                {schema.connection_name}
              </span>
            </p>

            {schema.tables.map((table) => (
              <div
                key={table.table_name}
                className="glass-subtle rounded-xl overflow-hidden animate-fade-in"
              >
                {/* Table header */}
                <button
                  onClick={() =>
                    setExpandedTable(
                      expandedTable === table.table_name
                        ? null
                        : table.table_name
                    )
                  }
                  className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="2"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <span className="font-semibold text-sm">
                        {table.schema_name}.{table.table_name}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)] ml-2">
                        {table.columns.length} columns · ~
                        {formatNumber(table.row_count_estimate)} rows
                      </span>
                    </div>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-tertiary)"
                    strokeWidth="2"
                    className={`transition-transform ${
                      expandedTable === table.table_name
                        ? "rotate-180"
                        : ""
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded details */}
                {expandedTable === table.table_name && (
                  <div className="border-t border-[var(--border-subtle)] p-4 animate-fade-in">
                    {table.description && (
                      <p className="text-xs text-[var(--text-secondary)] mb-3">
                        {table.description}
                      </p>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
                            <th className="text-left pb-2 pr-4">Column</th>
                            <th className="text-left pb-2 pr-4">Type</th>
                            <th className="text-left pb-2 pr-4">Nullable</th>
                            <th className="text-left pb-2 pr-4">Key</th>
                            <th className="text-left pb-2">References</th>
                          </tr>
                        </thead>
                        <tbody>
                          {table.columns.map((col) => (
                            <tr
                              key={col.name}
                              className="border-t border-[var(--border-subtle)]"
                            >
                              <td className="py-2 pr-4 font-mono text-xs">
                                {col.name}
                              </td>
                              <td className="py-2 pr-4 text-xs text-[var(--text-secondary)]">
                                {col.type}
                              </td>
                              <td className="py-2 pr-4 text-xs">
                                {col.nullable ? (
                                  <span className="text-[var(--text-tertiary)]">
                                    yes
                                  </span>
                                ) : (
                                  <span className="text-[var(--warning)]">
                                    NOT NULL
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-4 text-xs">
                                {col.is_pk && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-medium">
                                    PK
                                  </span>
                                )}
                              </td>
                              <td className="py-2 text-xs text-[var(--accent)]">
                                {col.fk_ref && `→ ${col.fk_ref}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {table.relationships.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
                        <h4 className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                          Relationships
                        </h4>
                        {table.relationships.map((rel, i) => (
                          <p
                            key={i}
                            className="text-xs text-[var(--text-secondary)]"
                          >
                            <span className="font-mono text-[var(--text-primary)]">
                              {rel.from_column}
                            </span>{" "}
                            →{" "}
                            <span className="font-mono text-[var(--accent)]">
                              {rel.to_table}.{rel.to_column}
                            </span>{" "}
                            <span className="text-[var(--text-tertiary)]">
                              ({rel.type})
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-subtle p-12 text-center">
            <p className="text-[var(--text-secondary)]">
              Select a connection to view its schema.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
