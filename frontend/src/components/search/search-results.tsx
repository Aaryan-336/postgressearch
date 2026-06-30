"use client";

import type { QueryResponse } from "@/lib/types";
import DataTable from "@/components/ui/data-table";
import { formatDuration, formatNumber } from "@/lib/utils";

interface SearchResultsProps {
  result: QueryResponse;
  question: string;
}

export default function SearchResults({ result, question }: SearchResultsProps) {
  return (
    <div className="animate-fade-in-up space-y-4">
      {/* Explanation Card */}
      <div className="glass-subtle p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center mt-0.5">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            <path d="M10 21h4" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">
            {result.explanation}
          </p>
          <div className="flex items-center gap-4 mt-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 3H5a2 2 0 0 0-2 2v4m0 6v4a2 2 0 0 0 2 2h4m6-18h4a2 2 0 0 1 2 2v4m0 6v4a2 2 0 0 1-2 2h-4" />
              </svg>
              {formatNumber(result.row_count)} rows
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {formatDuration(result.execution_time_ms)}
            </span>
          </div>
        </div>
      </div>

      {/* Data Table */}
      {result.row_count > 0 ? (
        <DataTable columns={result.columns} rows={result.rows} />
      ) : (
        <div className="glass-subtle p-8 text-center">
          <p className="text-[var(--text-secondary)]">
            No results found for your query. Try rephrasing your question.
          </p>
        </div>
      )}
    </div>
  );
}
