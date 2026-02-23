"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, ApiClientError } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { Toast } from "@/src/components/ui/Toast";
import { Badge } from "@/src/components/ui/Badge";

type SessionListItem = {
  id: string;
  title: string;
  status: "SCHEDULED" | "ACTIVE" | "ENDED";
  scheduledStartAt: string;
  actualStartAt: string | null;
  endedAt: string | null;
};

type SessionListResponse = {
  sessions: SessionListItem[];
};

const STATUS_OPTIONS = ["ALL", "SCHEDULED", "ACTIVE", "ENDED"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

export default function SessionsPage() {
  const { user } = useMe();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openCreate, setOpenCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDate, setCreateDate] = useState("");

  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const canCreate = user?.role === "TUTOR" || user?.role === "ADMIN";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
      const data = await apiGet<SessionListResponse>(`/api/sessions${query}`);
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => +new Date(b.scheduledStartAt) - +new Date(a.scheduledStartAt)),
    [sessions],
  );

  const createSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createTitle || !createDate) return;

    setCreating(true);
    try {
      const response = await apiPost<{ session: SessionListItem }>("/api/sessions", {
        title: createTitle,
        scheduledStartAt: new Date(createDate).toISOString(),
      });
      setOpenCreate(false);
      setCreateTitle("");
      setCreateDate("");
      setToast({ text: "Session created", tone: "success" });
      setSessions((prev) => [response.session, ...prev]);
    } catch (err) {
      setToast({
        text: err instanceof ApiClientError ? err.message : "Failed to create session",
        tone: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Sessions</h1>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <button onClick={() => void load()}>Refresh</button>
        {canCreate ? <button onClick={() => setOpenCreate((v) => !v)}>{openCreate ? "Close" : "Create session"}</button> : null}
      </div>

      {openCreate ? (
        <form
          onSubmit={createSession}
          style={{
            marginBottom: 16,
            border: "1px solid #d1d5db",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 8,
            maxWidth: 480,
            background: "#fff",
          }}
        >
          <input placeholder="Session title" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} required />
          <input type="datetime-local" value={createDate} onChange={(e) => setCreateDate(e.target.value)} required />
          <button disabled={creating}>{creating ? "Creating..." : "Create"}</button>
        </form>
      ) : null}

      {loading ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : error ? (
        <div style={{ color: "#b91c1c" }}>{error}</div>
      ) : sortedSessions.length === 0 ? (
        <div>No sessions found.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {sortedSessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`} style={{ textDecoration: "none" }}>
              <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{session.title}</strong>
                  <Badge
                    text={session.status}
                    tone={session.status === "ACTIVE" ? "success" : session.status === "ENDED" ? "neutral" : "warning"}
                  />
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
                  Scheduled: {new Date(session.scheduledStartAt).toLocaleString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {toast ? <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
