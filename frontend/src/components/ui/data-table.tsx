"use client";

import { useState, useMemo } from "react";
import type { QueryColumn } from "@/lib/types";
import { exportToCsv } from "@/lib/utils";

interface DataTableProps {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
}

type SortDirection = "asc" | "desc" | null;

export default function DataTable({ columns, rows }: DataTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  const handleSort = (colName: string) => {
    if (sortCol === colName) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortCol(null);
        setSortDir(null);
      }
    } else {
      setSortCol(colName);
      setSortDir("asc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortCol || !sortDir) return rows;

    return [...rows].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [rows, sortCol, sortDir]);

  const handleExport = () => {
    exportToCsv(columns, rows);
  };

  return (
    <div className="glass-subtle overflow-hidden">
      {/* Table Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
        <span className="text-xs text-[var(--text-secondary)]">
          {rows.length} {rows.length === 1 ? "result" : "results"}
        </span>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  className="cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors group"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.name}</span>
                    <span className="opacity-0 group-hover:opacity-50 transition-opacity">
                      {sortCol === col.name ? (
                        sortDir === "asc" ? (
                          "↑"
                        ) : (
                          "↓"
                        )
                      ) : (
                        "↕"
                      )}
                    </span>
                    {sortCol === col.name && (
                      <span className="text-[var(--accent)]">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {columns.map((col) => (
                  <td key={col.name} title={String(row[col.name] ?? "")}>
                    {formatCellValue(row[col.name], col.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCellValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (type === "number" && typeof value === "number") {
    return value % 1 === 0
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}
