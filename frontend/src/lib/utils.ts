/**
 * Utility functions for the NLPSearch frontend.
 */

import { clsx, type ClassValue } from "clsx";

/**
 * Merge class names with conditional support.
 * Simple implementation without tailwind-merge dependency.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Format a number with commas for display.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format milliseconds to a human-readable duration.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format a date string to relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format a date string to a full readable date.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Get a status color class based on query status.
 */
export function getStatusColor(
  status: string
): string {
  switch (status) {
    case "success":
      return "text-emerald-400 bg-emerald-400/10";
    case "error":
      return "text-red-400 bg-red-400/10";
    case "blocked":
      return "text-amber-400 bg-amber-400/10";
    case "timeout":
      return "text-orange-400 bg-orange-400/10";
    default:
      return "text-slate-400 bg-slate-400/10";
  }
}

/**
 * Export data as CSV and trigger download.
 */
export function exportToCsv(
  columns: { name: string }[],
  rows: Record<string, unknown>[],
  filename: string = "nlpsearch-results"
): void {
  const headers = columns.map((c) => c.name);
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          // Escape values containing commas, quotes, or newlines
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
