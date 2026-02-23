"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiClientError } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { Toast } from "@/src/components/ui/Toast";
import { Badge } from "@/src/components/ui/Badge";
import { Drawer } from "@/src/components/ui/Drawer";

type SessionParticipant = {
  userId: string;
  user?: {
    email: string;
    role: "ADMIN" | "TUTOR" | "STUDENT";
  };
  roleInSession: "TUTOR" | "STUDENT";
  canDraw: boolean;
  joinedAt: string | null;
  leftAt: string | null;
};

type SessionDetailResponse = {
  session: {
    id: string;
    title: string;
    status: "SCHEDULED" | "ACTIVE" | "ENDED";
    scheduledStartAt: string;
    actualStartAt: string | null;
    endedAt: string | null;
    createdByUserId: string;
  };
  participants: SessionParticipant[];
};

type SearchUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "ADMIN" | "TUTOR" | "STUDENT";
};

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const { user } = useMe();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SessionDetailResponse | null>(null);
  const [participantUserId, setParticipantUserId] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const canManageSession =
    Boolean(user && data && (user.role === "ADMIN" || data.session.createdByUserId === user.id || data.participants.some((p) => p.userId === user.id && p.roleInSession === "TUTOR" && p.leftAt === null)));
  const isEnded = data?.session.status === "ENDED";

  const load = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<SessionDetailResponse>(`/api/sessions/${sessionId}`);
      setData(response);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [sessionId]);

  useEffect(() => {
    if (!participantsOpen || !canManageSession) return;
    const q = participantSearch.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await apiGet<{ users: SearchUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(response.users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [participantSearch, participantsOpen, canManageSession]);

  const startSession = async () => {
    if (!sessionId) return;
    try {
      await apiPost(`/api/sessions/${sessionId}/start`);
      setToast({ text: "Session started", tone: "success" });
      await load();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed", tone: "error" });
    }
  };

  const endSession = async () => {
    if (!sessionId) return;
    try {
      await apiPost(`/api/sessions/${sessionId}/end`);
      setToast({ text: "Session ended", tone: "success" });
      await load();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed", tone: "error" });
    }
  };

  const addParticipant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sessionId || !participantUserId || !canManageSession || isEnded) return;

    try {
      await apiPost(`/api/sessions/${sessionId}/participants`, { userId: participantUserId });
      setParticipantUserId("");
      setParticipantSearch("");
      setSearchResults([]);
      setSelectedUser(null);
      setToast({
        text: selectedUser
          ? `Participant added: ${selectedUser.firstName} ${selectedUser.lastName} — ${selectedUser.email}`
          : "Participant added",
        tone: "success",
      });
      await load();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed", tone: "error" });
    }
  };

  const toggleDraw = async (participant: SessionParticipant) => {
    if (!sessionId || !canManageSession || isEnded) return;
    try {
      await apiPatch(`/api/sessions/${sessionId}/participants/${participant.userId}`, {
        canDraw: !participant.canDraw,
      });
      await load();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed", tone: "error" });
    }
  };

  const removeParticipant = async (participant: SessionParticipant) => {
    if (!sessionId || !canManageSession || isEnded) return;
    try {
      await apiDelete(`/api/sessions/${sessionId}/participants/${participant.userId}`);
      await load();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed", tone: "error" });
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Session Detail</h1>
        <Link href={sessionId ? `/sessions/${sessionId}/whiteboard` : "/sessions"}>Open whiteboard</Link>
      </div>

      {loading ? (
        <div style={{ display: "grid", gap: 8 }}>
          <Skeleton height={24} width="40%" />
          <Skeleton height={20} width="60%" />
          <Skeleton height={120} />
        </div>
      ) : error ? (
        <div style={{ color: "#b91c1c" }}>{error}</div>
      ) : data ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <strong>{data.session.title}</strong>
              <Badge
                text={data.session.status}
                tone={data.session.status === "ACTIVE" ? "success" : data.session.status === "SCHEDULED" ? "warning" : "neutral"}
              />
            </div>
            <div>Scheduled: {new Date(data.session.scheduledStartAt).toLocaleString()}</div>
            <div>Started: {data.session.actualStartAt ? new Date(data.session.actualStartAt).toLocaleString() : "-"}</div>
            <div>Ended: {data.session.endedAt ? new Date(data.session.endedAt).toLocaleString() : "-"}</div>

            {canManageSession ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                {data.session.status === "SCHEDULED" ? <button onClick={startSession}>Start session</button> : null}
                {data.session.status === "ACTIVE" ? <button onClick={endSession}>End session</button> : null}
                <button onClick={() => setParticipantsOpen(true)} disabled={isEnded}>
                  Manage participants
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Participants</h3>

            {!canManageSession ? <div style={{ color: "#64748b", marginBottom: 8 }}>Read-only participants view.</div> : null}

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">User</th>
                  <th align="left">User ID</th>
                  <th align="left">User Role</th>
                  <th align="left">Role</th>
                  <th align="left">canDraw</th>
                  <th align="left">Joined</th>
                  <th align="left">Left</th>
                  <th align="left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((p) => (
                  <tr key={p.userId} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td>{p.user?.email ?? "-"}</td>
                    <td>{p.userId}</td>
                    <td>{p.user?.role ?? "-"}</td>
                    <td>{p.roleInSession}</td>
                    <td>{String(p.canDraw)}</td>
                    <td>{p.joinedAt ? new Date(p.joinedAt).toLocaleString() : "-"}</td>
                    <td>{p.leftAt ? new Date(p.leftAt).toLocaleString() : "-"}</td>
                    <td>
                      {canManageSession ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button disabled={isEnded} onClick={() => void toggleDraw(p)}>Toggle draw</button>
                          <button disabled={isEnded} onClick={() => void removeParticipant(p)}>Remove</button>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Drawer open={participantsOpen} title="Manage Participants" onClose={() => setParticipantsOpen(false)}>
        <form onSubmit={addParticipant} style={{ display: "grid", gap: 8, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "#475569" }}>Search user by first/last name</label>
          <input
            value={participantSearch}
            onChange={(e) => {
              setParticipantSearch(e.target.value);
              setSelectedUser(null);
            }}
            placeholder="Type name..."
            disabled={!canManageSession || Boolean(isEnded)}
          />
          {searchLoading ? <div style={{ fontSize: 12, color: "#64748b" }}>Searching...</div> : null}
          {searchResults.length > 0 ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, maxHeight: 180, overflowY: "auto" }}>
              {searchResults.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => {
                    setParticipantUserId(u.id);
                    setSelectedUser(u);
                    setSearchResults([]);
                    setParticipantSearch(`${u.firstName} ${u.lastName}`);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid #f1f5f9",
                    background: "white",
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {u.firstName} {u.lastName} — {u.email}
                </button>
              ))}
            </div>
          ) : null}
          <input
            value={participantUserId}
            onChange={(e) => setParticipantUserId(e.target.value)}
            placeholder="Selected User ID"
            disabled={!canManageSession || Boolean(isEnded)}
          />
          <button disabled={!canManageSession || Boolean(isEnded) || !participantUserId}>Add participant</button>
        </form>
      </Drawer>

      {toast ? <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
