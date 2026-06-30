"use client";

import { formatRelativeTime } from "@/lib/utils";

interface HistoryEntry {
  question: string;
  timestamp: Date;
  status: "success" | "error";
  rowCount?: number;
}

interface QueryHistoryProps {
  history: HistoryEntry[];
  onSelect: (question: string) => void;
}

export default function QueryHistory({
  history,
  onSelect,
}: QueryHistoryProps) {
  return (
    <div className="glass-subtle p-3 animate-fade-in">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] px-2 mb-2">
        Recent Queries
      </h3>
      <div className="space-y-1">
        {history.map((entry, i) => (
          <button
            key={`${entry.question}-${i}`}
            onClick={() => onSelect(entry.question)}
            className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors group cursor-pointer"
          >
            <p className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate transition-colors">
              {entry.question}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  entry.status === "success"
                    ? "bg-[var(--success)]"
                    : "bg-[var(--error)]"
                }`}
              />
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {formatRelativeTime(entry.timestamp.toISOString())}
              </span>
              {entry.rowCount !== undefined && (
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  · {entry.rowCount} rows
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
