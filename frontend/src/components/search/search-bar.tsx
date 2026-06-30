"use client";

import { useState, useRef, useEffect } from "react";

interface SearchBarProps {
  onSearch: (question: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [query]);

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (trimmed && !loading) {
      onSearch(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative glow-border rounded-2xl">
      <div className="glass glow-focus flex items-end gap-2 p-3 rounded-2xl transition-all duration-300">
        {/* Search icon */}
        <div className="flex-shrink-0 p-1.5 mb-0.5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </div>

        {/* Input */}
        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your database anything..."
          disabled={loading}
          rows={1}
          className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-base outline-none resize-none min-h-[28px] leading-7 disabled:opacity-50"
          id="search-input"
        />

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!query.trim() || loading}
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-30 disabled:hover:bg-[var(--accent)] flex items-center justify-center transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shadow-md shadow-purple-500/20"
          id="search-submit"
          aria-label="Submit search"
        >
          {loading ? (
            <div
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              style={{ animation: "spin-slow 0.8s linear infinite" }}
            />
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
