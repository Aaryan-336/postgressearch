"use client";

import { useState } from "react";
import { createConnection, testConnection, introspectConnection } from "@/lib/api";

interface DbLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (connectionId: string) => void;
}

type ConnectStep = "idle" | "creating" | "testing" | "introspecting" | "done" | "error";

export default function DbLoginModal({ isOpen, onClose, onSuccess }: DbLoginModalProps) {
  const [connectionString, setConnectionString] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<ConnectStep>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic URL parsing to get database name for default name
    let parsedName = name.trim();
    if (!parsedName) {
      try {
        const url = new URL(connectionString);
        parsedName = url.pathname.replace("/", "") || "My Database";
      } catch {
        parsedName = "My Database";
      }
    }

    try {
      // Step 1: Create
      setStep("creating");
      const conn = await createConnection({
        name: parsedName,
        connection_string: connectionString,
      });

      // Step 2: Test
      setStep("testing");
      const testResult = await testConnection(conn.id);
      if (!testResult.success) {
        throw new Error(testResult.message || "Connection test failed");
      }

      // Step 3: Introspect
      setStep("introspecting");
      await introspectConnection(conn.id);

      // Step 4: Save & Close
      setStep("done");
      localStorage.setItem("nlpsearch_connection_id", conn.id);
      
      // Delay slightly for nice UX transition
      setTimeout(() => {
        onSuccess(conn.id);
        onClose();
        setStep("idle");
        setConnectionString("");
        setName("");
      }, 800);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to database");
      setStep("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
        onClick={step === "idle" || step === "error" ? onClose : undefined}
      />

      {/* Modal Content */}
      <div className="relative glass p-6 w-full max-w-md animate-fade-in-up shadow-2xl z-10 border border-[var(--border)]">
        {/* Close Button */}
        {(step === "idle" || step === "error") && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Dynamic Step Interfaces */}
        {step === "idle" || step === "error" ? (
          <div>
            <h2 className="text-xl font-bold mb-1">Connect Database</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-6">
              Enter your PostgreSQL connection URL. Choose a read-only user for security.
            </p>

            {error && (
              <div className="p-3 mb-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-xs text-[var(--error)] animate-fade-in">
                <span className="font-semibold">Connection Error:</span> {error}
              </div>
            )}

            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  Connection Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sales Production"
                  className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  PostgreSQL URL
                </label>
                <input
                  type="text"
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  placeholder="postgresql://user:pass@host:5432/dbname"
                  required
                  className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 mt-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-all shadow-md shadow-purple-500/20 cursor-pointer"
              >
                {step === "error" ? "Try Again" : "Connect & Analyze"}
              </button>
            </form>
          </div>
        ) : (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            {step === "done" ? (
              <div className="w-14 h-14 mb-4 rounded-full bg-[var(--success)]/15 flex items-center justify-center animate-fade-in">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            ) : (
              <div
                className="w-10 h-10 mb-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"
                style={{ animation: "spin-slow 1s linear infinite" }}
              />
            )}

            <h3 className="font-semibold text-lg text-[var(--text-primary)]">
              {step === "creating" && "Initializing Connection..."}
              {step === "testing" && "Verifying Credentials..."}
              {step === "introspecting" && "Analyzing Database Schema..."}
              {step === "done" && "Successfully Connected!"}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 max-w-[280px]">
              {step === "creating" && "Creating database connection metadata on the server."}
              {step === "testing" && "Testing TCP and credential handshake with target database."}
              {step === "introspecting" && "Extracting tables and metadata, generating embedding vectors."}
              {step === "done" && "Loading schema information into dashboard."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
