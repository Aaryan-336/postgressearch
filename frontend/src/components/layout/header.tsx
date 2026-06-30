"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { listConnections } from "@/lib/api";
import type { ConnectionResponse } from "@/lib/types";
import DbLoginModal from "@/components/ui/db-login-modal";

interface HeaderProps {
  onConnectionChange?: (id: string | null) => void;
}

export default function Header({ onConnectionChange }: HeaderProps) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [activeConn, setActiveConn] = useState<ConnectionResponse | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load connections and set active connection details
  const loadConnections = async () => {
    try {
      const data = await listConnections();
      setConnections(data);
      
      const activeId = localStorage.getItem("nlpsearch_connection_id");
      if (activeId) {
        const found = data.find((c) => c.id === activeId);
        setActiveConn(found || null);
      } else {
        setActiveConn(null);
      }
    } catch (err) {
      console.error("Failed to fetch connections in header:", err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadConnections();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Update active connection when localStorage changes elsewhere
  useEffect(() => {
    const handleStorageChange = () => {
      const activeId = localStorage.getItem("nlpsearch_connection_id");
      if (activeId) {
        const found = connections.find((c) => c.id === activeId);
        setActiveConn(found || null);
      } else {
        setActiveConn(null);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [connections]);

  // Click outside handler for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectConnection = (id: string) => {
    localStorage.setItem("nlpsearch_connection_id", id);
    const selected = connections.find((c) => c.id === id) || null;
    setActiveConn(selected);
    setIsDropdownOpen(false);
    if (onConnectionChange) {
      onConnectionChange(id);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem("nlpsearch_connection_id");
    setActiveConn(null);
    setIsDropdownOpen(false);
    if (onConnectionChange) {
      onConnectionChange(null);
    }
  };

  const handleNewConnectionSuccess = (id: string) => {
    loadConnections();
    if (onConnectionChange) {
      onConnectionChange(id);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg)]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent)] to-purple-400 flex items-center justify-center shadow-md shadow-purple-500/15 group-hover:shadow-purple-500/30 transition-shadow">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </div>
          <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">
            NLPSearch
          </span>
        </Link>

        {/* Middle Navigation */}
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              pathname === "/"
                ? "text-[var(--text-primary)] bg-[var(--bg-surface)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Search
          </Link>
          <Link
            href="/setup"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              pathname === "/setup"
                ? "text-[var(--text-primary)] bg-[var(--bg-surface)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Setup
          </Link>
          <Link
            href="/admin"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isAdmin
                ? "text-[var(--text-primary)] bg-[var(--bg-surface)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Admin
          </Link>
        </nav>

        {/* Database Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer select-none"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${activeConn ? "bg-[var(--success)] animate-pulse-soft" : "bg-[var(--text-tertiary)]"}`} />
            <span className="max-w-[120px] truncate">
              {activeConn ? activeConn.name : "Select Database"}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-2 shadow-xl animate-fade-in-up">
              <div className="px-2 py-1.5 border-b border-[var(--border-subtle)] mb-2">
                <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider">
                  Active Database
                </span>
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate mt-0.5">
                  {activeConn ? activeConn.name : "None connected"}
                </p>
              </div>

              {/* Connections list */}
              <div className="max-h-48 overflow-y-auto mb-2 space-y-0.5">
                {connections.length === 0 ? (
                  <p className="text-[10px] text-[var(--text-tertiary)] px-2 py-3 text-center">
                    No databases connected.
                  </p>
                ) : (
                  connections.map((conn) => (
                    <button
                      key={conn.id}
                      onClick={() => handleSelectConnection(conn.id)}
                      className={`w-full text-left px-2 py-2 rounded-lg text-xs flex items-center justify-between hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer ${
                        activeConn?.id === conn.id ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <span className="truncate pr-2">{conn.name}</span>
                      {activeConn?.id === conn.id && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
                <button
                  onClick={() => { setIsDropdownOpen(false); setIsModalOpen(true); }}
                  className="w-full text-left px-2 py-2 rounded-lg text-xs text-[var(--accent)] hover:bg-[var(--bg-surface-hover)] transition-all flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Connect New Database...
                </button>
                {activeConn && (
                  <button
                    onClick={handleDisconnect}
                    className="w-full text-left px-2 py-2 rounded-lg text-xs text-[var(--error)] hover:bg-[var(--bg-surface-hover)] transition-all flex items-center gap-1.5 cursor-pointer font-medium"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal for connecting a new database via URL */}
      <DbLoginModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleNewConnectionSuccess}
      />
    </header>
  );
}
