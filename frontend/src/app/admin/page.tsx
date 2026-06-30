"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAdminStats } from "@/lib/api";
import type { AdminStats } from "@/lib/types";
import Header from "@/components/layout/header";
import { formatNumber } from "@/lib/utils";

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await getAdminStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = localStorage.getItem("nlpsearch_admin_key");
      if (saved) {
        setAdminKey(saved);
        setIsAuthenticated(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => {
      loadStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("nlpsearch_admin_key", adminKey);
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="glass p-6 w-full max-w-sm animate-fade-in">
            <h2 className="text-lg font-semibold mb-1">Admin Access</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Enter your admin API key to access the dashboard.
            </p>
            <form onSubmit={handleAuth} className="space-y-4">
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Admin API Key"
                required
                className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-all cursor-pointer"
              >
                Access Dashboard
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const statCards = stats
    ? [
        {
          label: "Total Queries",
          value: formatNumber(stats.total_queries),
          icon: "📊",
          color: "var(--accent)",
        },
        {
          label: "Queries Today",
          value: formatNumber(stats.queries_today),
          icon: "📈",
          color: "var(--info)",
        },
        {
          label: "Avg Response",
          value: `${stats.avg_execution_time_ms.toFixed(0)}ms`,
          icon: "⚡",
          color: "var(--success)",
        },
        {
          label: "Success Rate",
          value: `${stats.success_rate}%`,
          icon: "✅",
          color: "var(--success)",
        },
        {
          label: "Active Connections",
          value: formatNumber(stats.active_connections),
          icon: "🔗",
          color: "var(--accent)",
        },
        {
          label: "Total Tables",
          value: formatNumber(stats.total_tables),
          icon: "📋",
          color: "var(--info)",
        },
        {
          label: "Blocked Queries",
          value: formatNumber(stats.blocked_queries),
          icon: "🛡️",
          color: "var(--warning)",
        },
      ]
    : [];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Monitor queries, manage connections, and view system health.
            </p>
          </div>
          <button
            onClick={loadStats}
            className="px-4 py-2 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
          >
            ↻ Refresh
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-sm text-[var(--error)] mb-6">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="glass-subtle p-4 h-24 animate-shimmer rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {statCards.map((card, i) => (
              <div
                key={card.label}
                className="glass-subtle p-4 rounded-xl animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{card.icon}</span>
                  <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                    {card.label}
                  </span>
                </div>
                <p
                  className="text-2xl font-bold"
                  style={{ color: card.color }}
                >
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/admin/logs"
            className="glass-subtle p-5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-[var(--accent)] transition-colors">
                  Query Logs
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  View all queries and generated SQL
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/connections"
            className="glass-subtle p-5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(210,80%,60%)" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-[var(--info)] transition-colors">
                  Connections
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Manage database connections
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/schema"
            className="glass-subtle p-5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(150,60%,50%)" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm group-hover:text-[var(--success)] transition-colors">
                  Schema Explorer
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  View tables, columns, and relationships
                </p>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
