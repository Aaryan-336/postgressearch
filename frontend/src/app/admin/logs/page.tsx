"use client";

import { useState, useEffect, useCallback } from "react";
import { getQueryLogs, getQuerySql } from "@/lib/api";
import type { QueryLogEntry } from "@/lib/types";
import Header from "@/components/layout/header";
import { formatRelativeTime, getStatusColor, truncate } from "@/lib/utils";

export default function LogsPage() {
  const [logs, setLogs] = useState<QueryLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<{
    id: string;
    natural_language_query: string;
    generated_sql: string | null;
    status: string;
    error_message: string | null;
  } | null>(null);

  const pageSize = 20;

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQueryLogs({ page, page_size: pageSize });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLogs();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  const handleViewSql = async (logId: string) => {
    try {
      const data = await getQuerySql(logId);
      setSelectedLog(data);
    } catch (err) {
      console.error("Failed to load SQL:", err);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Query Logs</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {total} total queries logged
            </p>
          </div>
          <button
            onClick={loadLogs}
            className="px-4 py-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Logs Table */}
        <div className="glass-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Time</th>
                  <th>Timestamp</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [...Array(5)].map((_, i) => (
                      <tr key={i} style={{ animationDelay: "0ms", opacity: 1 }}>
                        <td colSpan={6}>
                          <div className="h-6 animate-shimmer rounded" />
                        </td>
                      </tr>
                    ))
                  : logs.map((log) => (
                      <tr key={log.id}>
                        <td className="max-w-xs" title={log.natural_language_query}>
                          {truncate(log.natural_language_query, 60)}
                        </td>
                        <td>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(log.status)}`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td>{log.row_count ?? "—"}</td>
                        <td>
                          {log.execution_time_ms
                            ? `${log.execution_time_ms}ms`
                            : "—"}
                        </td>
                        <td className="text-[var(--text-secondary)]">
                          {formatRelativeTime(log.created_at)}
                        </td>
                        <td>
                          <button
                            onClick={() => handleViewSql(log.id)}
                            className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
                          >
                            View SQL
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-30 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SQL Viewer Modal */}
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="glass p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto animate-fade-in-up">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Generated SQL</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="w-8 h-8 rounded-lg hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                    Question
                  </label>
                  <p className="text-sm mt-1">
                    {selectedLog.natural_language_query}
                  </p>
                </div>

                <div>
                  <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                    Status
                  </label>
                  <p className="mt-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedLog.status)}`}
                    >
                      {selectedLog.status}
                    </span>
                  </p>
                </div>

                {selectedLog.generated_sql && (
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                      SQL
                    </label>
                    <pre className="mt-1 p-4 bg-[var(--bg)] rounded-lg text-sm font-mono text-[var(--text-primary)] overflow-x-auto border border-[var(--border-subtle)]">
                      {selectedLog.generated_sql}
                    </pre>
                  </div>
                )}

                {selectedLog.error_message && (
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                      Error
                    </label>
                    <p className="text-sm mt-1 text-[var(--error)]">
                      {selectedLog.error_message}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
