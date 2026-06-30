"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createConnection, testConnection, introspectConnection } from "@/lib/api";
import Header from "@/components/layout/header";

type Step = "connect" | "testing" | "introspecting" | "done";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("connect");
  const [mode, setMode] = useState<"string" | "fields">("fields");
  const [error, setError] = useState<string | null>(null);
  const [introspectResult, setIntrospectResult] = useState<{
    tables_found: number;
    embeddings_created: number;
  } | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Create connection
      const conn = await createConnection({
        name: name || "My Database",
        ...(mode === "string"
          ? { connection_string: connectionString }
          : { host, port: parseInt(port), database, username, password }),
      });

      // Test connection
      setStep("testing");
      const testResult = await testConnection(conn.id);
      if (!testResult.success) {
        setError(`Connection failed: ${testResult.message}`);
        setStep("connect");
        return;
      }

      // Introspect
      setStep("introspecting");
      const result = await introspectConnection(conn.id);
      setIntrospectResult(result);

      // Save connection ID
      localStorage.setItem("nlpsearch_connection_id", conn.id);

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setStep("connect");
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {(["connect", "testing", "introspecting", "done"] as Step[]).map(
              (s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                      step === s
                        ? "bg-[var(--accent)] text-white shadow-lg shadow-purple-500/20"
                        : (["connect", "testing", "introspecting", "done"].indexOf(step) > i)
                        ? "bg-[var(--success)]/20 text-[var(--success)]"
                        : "bg-[var(--bg-surface)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {["connect", "testing", "introspecting", "done"].indexOf(step) > i ? "✓" : i + 1}
                  </div>
                  {i < 3 && (
                    <div
                      className={`w-8 h-0.5 ${
                        ["connect", "testing", "introspecting", "done"].indexOf(step) > i
                          ? "bg-[var(--success)]"
                          : "bg-[var(--border-subtle)]"
                      }`}
                    />
                  )}
                </div>
              )
            )}
          </div>

          {/* Step: Connect */}
          {step === "connect" && (
            <div className="glass p-6 animate-fade-in">
              <h2 className="text-xl font-semibold mb-1">Connect your database</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Enter your PostgreSQL connection details. Use a read-only user for security.
              </p>

              {/* Mode Toggle */}
              <div className="flex gap-1 p-1 bg-[var(--bg-surface)] rounded-lg mb-6 w-fit">
                <button
                  type="button"
                  onClick={() => setMode("fields")}
                  className={`px-4 py-1.5 rounded-md text-sm transition-all cursor-pointer ${
                    mode === "fields"
                      ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  Individual Fields
                </button>
                <button
                  type="button"
                  onClick={() => setMode("string")}
                  className={`px-4 py-1.5 rounded-md text-sm transition-all cursor-pointer ${
                    mode === "string"
                      ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  Connection String
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Connection Name */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Connection Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Production HR Database"
                    className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                  />
                </div>

                {mode === "string" ? (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                      Connection String
                    </label>
                    <input
                      type="text"
                      value={connectionString}
                      onChange={(e) => setConnectionString(e.target.value)}
                      placeholder="postgresql://user:password@host:5432/database"
                      required
                      className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all font-mono"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Host
                      </label>
                      <input
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        placeholder="localhost"
                        required
                        className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Port
                      </label>
                      <input
                        type="text"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="5432"
                        required
                        className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Database
                      </label>
                      <input
                        type="text"
                        value={database}
                        onChange={(e) => setDatabase(e.target.value)}
                        placeholder="mydb"
                        required
                        className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Username
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="readonly_user"
                        required
                        className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-sm text-[var(--error)]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-all shadow-md shadow-purple-500/20 cursor-pointer"
                >
                  Connect & Introspect
                </button>
              </form>

              <p className="text-xs text-[var(--text-tertiary)] mt-4 text-center">
                Credentials are encrypted at rest and never exposed to the frontend.
              </p>
            </div>
          )}

          {/* Step: Testing */}
          {step === "testing" && (
            <div className="glass p-8 text-center animate-fade-in">
              <div
                className="w-10 h-10 mx-auto mb-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"
                style={{ animation: "spin-slow 1s linear infinite" }}
              />
              <h2 className="text-lg font-semibold mb-1">Testing connection...</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Verifying connectivity to your database.
              </p>
            </div>
          )}

          {/* Step: Introspecting */}
          {step === "introspecting" && (
            <div className="glass p-8 text-center animate-fade-in">
              <div
                className="w-10 h-10 mx-auto mb-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"
                style={{ animation: "spin-slow 1s linear infinite" }}
              />
              <h2 className="text-lg font-semibold mb-1">
                Analyzing database schema...
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Extracting tables, columns, and relationships. Building AI embeddings.
              </p>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && introspectResult && (
            <div className="glass p-8 text-center animate-fade-in-up">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[var(--success)]/15 flex items-center justify-center">
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
              <h2 className="text-xl font-semibold mb-2">Setup Complete!</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Your database is connected and ready for natural language search.
              </p>

              <div className="flex justify-center gap-6 mb-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-[var(--accent)]">
                    {introspectResult.tables_found}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">Tables found</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-[var(--accent)]">
                    {introspectResult.embeddings_created}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Embeddings created
                  </p>
                </div>
              </div>

              <button
                onClick={() => router.push("/")}
                className="px-6 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-all shadow-md shadow-purple-500/20 cursor-pointer"
              >
                Start Searching →
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
