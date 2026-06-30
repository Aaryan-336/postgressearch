"use client";

import { useState, useCallback, useEffect } from "react";
import { queryDatabase, listConnections, createConnection, testConnection, introspectConnection } from "@/lib/api";
import type { QueryResponse, ConnectionResponse } from "@/lib/types";
import SearchBar from "@/components/search/search-bar";
import SearchResults from "@/components/search/search-results";
import QueryHistory from "@/components/search/query-history";
import Header from "@/components/layout/header";

interface HistoryEntry {
  question: string;
  timestamp: Date;
  status: "success" | "error";
  rowCount?: number;
}

type ConnectStep = "idle" | "creating" | "testing" | "introspecting" | "done" | "error";

interface Profile {
  name: string;
  email: string;
  role: string;
  department: string;
  location: string;
}

const PROFILES: Profile[] = [
  { name: "Intern (Marketing, Delhi)", email: "intern@company.com", role: "intern", department: "marketing", location: "Delhi" },
  { name: "Analyst (Finance, Mumbai)", email: "analyst@company.com", role: "analyst", department: "finance", location: "Mumbai" },
  { name: "Manager (Finance, Mumbai)", email: "manager@company.com", role: "manager", department: "finance", location: "Mumbai" },
  { name: "Director (Finance, Mumbai)", email: "director@company.com", role: "director", department: "finance", location: "Mumbai" },
  { name: "Admin (IT, Mumbai)", email: "admin@company.com", role: "admin", department: "it", location: "Mumbai" },
];

export default function HomePage() {
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  
  // Simulated profile state
  const [selectedProfile, setSelectedProfile] = useState<Profile>(PROFILES[1]); // Default to Analyst
  
  // Connection and login state
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [loginMode, setLoginMode] = useState<"url" | "existing">("url");
  
  // URL form state
  const [connectionString, setConnectionString] = useState("");
  const [customName, setCustomName] = useState("");
  const [connectStep, setConnectStep] = useState<ConnectStep>("idle");
  const [connectError, setConnectError] = useState<string | null>(null);

  const loadAllConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const data = await listConnections();
      setConnections(data);
      if (data.length > 0 && loginMode === "url") {
        setLoginMode("existing"); // Default to existing if some exist
      }
    } catch (err) {
      console.error("Failed to load connections:", err);
    } finally {
      setLoadingConnections(false);
    }
  }, [loginMode]);

  // Initialize and load connections
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const savedId = localStorage.getItem("nlpsearch_connection_id");
        setActiveConnectionId(savedId);
      }
      loadAllConnections();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAllConnections]);

  const handleSearch = useCallback(async (question: string) => {
    if (!activeConnectionId) {
      setError("No database connected. Please connect a database first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentQuestion(question);

    try {
      const response = await queryDatabase({
        connection_id: activeConnectionId,
        question,
        user: {
          email: selectedProfile.email,
          role: selectedProfile.role,
          department: selectedProfile.department,
          location: selectedProfile.location,
        }
      });
      setResult(response);
      setHistory((prev) => [
        {
          question,
          timestamp: new Date(),
          status: "success",
          rowCount: response.row_count,
        },
        ...prev.slice(0, 19), // Keep last 20
      ],);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      setHistory((prev) => [
        { question, timestamp: new Date(), status: "error" },
        ...prev.slice(0, 19),
      ]);
    } finally {
      setLoading(false);
    }
  }, [activeConnectionId, selectedProfile]);

  // Connect to an existing database connection
  const handleConnectExisting = async (id: string) => {
    setConnectStep("testing");
    setConnectError(null);
    try {
      const testResult = await testConnection(id);
      if (!testResult.success) {
        throw new Error(testResult.message || "Connection test failed");
      }
      
      setConnectStep("done");
      localStorage.setItem("nlpsearch_connection_id", id);
      setTimeout(() => {
        setActiveConnectionId(id);
        setConnectStep("idle");
      }, 500);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Failed to connect");
      setConnectStep("error");
    }
  };

  // Connect via new URL string
  const handleConnectUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError(null);

    let parsedName = customName.trim();
    if (!parsedName) {
      try {
        const url = new URL(connectionString);
        parsedName = url.pathname.replace("/", "") || "My Database";
      } catch {
        parsedName = "My Database";
      }
    }

    try {
      setConnectStep("creating");
      const conn = await createConnection({
        name: parsedName,
        connection_string: connectionString,
      });

      setConnectStep("testing");
      const testResult = await testConnection(conn.id);
      if (!testResult.success) {
        throw new Error(testResult.message || "Connection test failed");
      }

      setConnectStep("introspecting");
      await introspectConnection(conn.id);

      setConnectStep("done");
      localStorage.setItem("nlpsearch_connection_id", conn.id);
      setTimeout(() => {
        setActiveConnectionId(conn.id);
        setConnectStep("idle");
        setConnectionString("");
        setCustomName("");
        loadAllConnections();
      }, 500);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Failed to setup database");
      setConnectStep("error");
    }
  };

  // Callback from Header dropdown selector
  const handleConnectionChange = (id: string | null) => {
    if (id) {
      localStorage.setItem("nlpsearch_connection_id", id);
      setActiveConnectionId(id);
    } else {
      localStorage.removeItem("nlpsearch_connection_id");
      setActiveConnectionId(null);
    }
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header onConnectionChange={handleConnectionChange} />

      <main className="flex-1 flex flex-col">
        {!activeConnectionId ? (
          /* Database Login / Connection Selector Page */
          <div className="flex-1 flex items-center justify-center p-4 min-h-[80vh]">
            <div className="w-full max-w-md">
              <div className="text-center mb-8">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-[var(--text-primary)] via-purple-300 to-[var(--accent)] bg-clip-text text-transparent">
                      NLPSearch
                    </span>
                  </h1>
                </div>
                <p className="text-[var(--text-secondary)] text-sm max-w-xs mx-auto">
                  Connect to a PostgreSQL database to start natural language querying.
                </p>
              </div>

              <div className="glass p-6 shadow-2xl relative border border-[var(--border)]">
                {connectStep === "idle" || connectStep === "error" ? (
                  <div>
                    {/* Switch mode tabs */}
                    <div className="flex gap-1 p-1 bg-[var(--bg-surface)] rounded-lg mb-6">
                      <button
                        onClick={() => { setLoginMode("url"); setConnectError(null); }}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          loginMode === "url"
                            ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)] shadow-sm"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Connect via URL
                      </button>
                      <button
                        onClick={() => { setLoginMode("existing"); setConnectError(null); }}
                        disabled={connections.length === 0}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          loginMode === "existing"
                            ? "bg-[var(--bg-surface-hover)] text-[var(--text-primary)] shadow-sm"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Select Database ({connections.length})
                      </button>
                    </div>

                    {connectError && (
                      <div className="p-3 mb-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 text-xs text-[var(--error)] animate-fade-in">
                        <span className="font-semibold">Failed to connect:</span> {connectError}
                      </div>
                    )}

                    {loginMode === "url" ? (
                      <form onSubmit={handleConnectUrl} className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                            Friendly Name (optional)
                          </label>
                          <input
                            type="text"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            placeholder="e.g. Finance DB"
                            className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all animate-fade-in"
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
                            className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-all font-mono animate-fade-in"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 mt-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium text-sm transition-all shadow-md shadow-purple-500/20 cursor-pointer"
                        >
                          Connect Database
                        </button>
                      </form>
                    ) : (
                      /* Existing connection selector */
                      <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1 animate-fade-in">
                        {loadingConnections ? (
                          <div className="h-20 animate-shimmer rounded-lg" />
                        ) : (
                          connections.map((conn) => (
                            <div
                              key={conn.id}
                              className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-all"
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <h3 className="font-semibold text-sm truncate">{conn.name}</h3>
                                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                  {conn.table_count} tables • Scanned: {conn.last_introspected_at ? new Date(conn.last_introspected_at).toLocaleDateString() : "Never"}
                                </p>
                              </div>
                              <button
                                onClick={() => handleConnectExisting(conn.id)}
                                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all cursor-pointer font-medium"
                              >
                                Connect
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Connection Loading Overlay */
                  <div className="py-8 text-center flex flex-col items-center justify-center animate-fade-in">
                    {connectStep === "done" ? (
                      <div className="w-12 h-12 mb-4 rounded-full bg-[var(--success)]/15 flex items-center justify-center animate-fade-in">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                    ) : (
                      <div
                        className="w-10 h-10 mb-4 border-2 border-[var(--accent)] border-t-transparent rounded-full"
                        style={{ animation: "spin-slow 1s linear infinite" }}
                      />
                    )}

                    <h3 className="font-semibold text-lg">
                      {connectStep === "creating" && "Creating Connection..."}
                      {connectStep === "testing" && "Verifying Database..."}
                      {connectStep === "introspecting" && "Analyzing Schema..."}
                      {connectStep === "done" && "Connected!"}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-[280px]">
                      {connectStep === "creating" && "Initializing connection record on server."}
                      {connectStep === "testing" && "Establishing database connection handshake."}
                      {connectStep === "introspecting" && "Running AI introspection on tables and columns."}
                      {connectStep === "done" && "Redirecting to your NLPSearch dashboard."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Normal Dashboard Search View */
          <>
            {/* Hero Section */}
            <div
              className={`flex flex-col items-center justify-center transition-all duration-500 ease-out ${
                result || loading || error
                  ? "pt-8 pb-4"
                  : "pt-[18vh] pb-8"
              }`}
            >
              {/* Logo & Title */}
              <div
                className={`text-center mb-8 transition-all duration-500 ${
                  result || loading || error ? "scale-90 opacity-80" : ""
                }`}
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <svg
                      width="20"
                      height="20"
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
                  <h1 className="text-3xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-[var(--text-primary)] via-purple-300 to-[var(--accent)] bg-clip-text text-transparent">
                      NLPSearch
                    </span>
                  </h1>
                </div>
                <p className="text-[var(--text-secondary)] text-lg max-w-md mx-auto">
                  Ask your database anything in plain English.
                </p>
              </div>

              {/* Search Bar with Simulated Profile selector */}
              <div className="w-full max-w-3xl px-4">
                <div className="flex items-center justify-between mb-2 px-1 text-xs">
                  <span className="text-[var(--text-secondary)] font-medium">Simulate Profile:</span>
                  <select
                    value={selectedProfile.role}
                    onChange={(e) => {
                      const found = PROFILES.find(p => p.role === e.target.value);
                      if (found) setSelectedProfile(found);
                    }}
                    className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md px-2.5 py-1 text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all cursor-pointer font-medium"
                  >
                    {PROFILES.map((p) => (
                      <option key={p.role} value={p.role}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <SearchBar onSearch={handleSearch} loading={loading} />
              </div>

              {/* Example Queries */}
              {!result && !loading && !error && (
                <div className="flex flex-wrap gap-2 mt-6 max-w-3xl px-4 justify-center animate-fade-in">
                  {[
                    "Show all employees who joined in 2020",
                    "Top 10 clients by revenue",
                    "Which departments have the most employees?",
                    "Show inactive customers from Mumbai",
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => handleSearch(example)}
                      className="px-4 py-2 rounded-full text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border)] transition-all duration-200 cursor-pointer"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Results Area */}
            <div className="flex-1 w-full max-w-6xl mx-auto px-4 pb-8">
              {error && (
                <div className="animate-fade-in-up glass-subtle p-4 border-l-4 border-[var(--error)] mb-4">
                  <div className="flex items-center gap-2">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--error)"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4m0 4h.01" />
                    </svg>
                    <p className="text-[var(--error)] text-sm font-medium">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {loading && (
                <div className="animate-fade-in-up">
                  <div className="glass-subtle p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" style={{ animation: "spin-slow 1s linear infinite" }} />
                      <p className="text-sm text-[var(--text-secondary)]">
                        Analyzing your question and searching the database...
                      </p>
                    </div>
                    {/* Skeleton table */}
                    <div className="space-y-3">
                      <div className="h-8 rounded animate-shimmer" />
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="h-10 rounded animate-shimmer"
                          style={{ animationDelay: `${i * 100}ms`, opacity: 1 - i * 0.15 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {result && !loading && (
                <SearchResults result={result} question={currentQuestion} />
              )}
            </div>

            {/* History Sidebar */}
            {history.length > 0 && !result && !loading && !error && (
              <div className="fixed right-4 top-20 w-72 hidden xl:block">
                <QueryHistory
                  history={history}
                  onSelect={(q) => handleSearch(q)}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
