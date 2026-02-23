"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiClientError } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";
import { Skeleton } from "@/src/components/Skeleton";
import { Toast } from "@/src/components/Toast";

type SessionParticipant = {
  userId: string;
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

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const { user } = useMe();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SessionDetailResponse | null>(null);
  const [participantUserId, setParticipantUserId] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const canManage = user?.role === "TUTOR" || user?.role === "ADMIN";

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
    if (!sessionId || !participantUserId) return;

    try {
      await apiPost(`/api/sessions/${sessionId}/participants`, { userId: participantUserId });
      setParticipantUserId("");
      setToast({ text: "Participant added", tone: "success" });
      await load();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed", tone: "error" });
    }
  };

  const toggleDraw = async (participant: SessionParticipant) => {
    if (!sessionId) return;
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
    if (!sessionId) return;
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
            <div><strong>{data.session.title}</strong></div>
            <div>Status: {data.session.status}</div>
            <div>Scheduled: {new Date(data.session.scheduledStartAt).toLocaleString()}</div>
            <div>Started: {data.session.actualStartAt ? new Date(data.session.actualStartAt).toLocaleString() : "-"}</div>
            <div>Ended: {data.session.endedAt ? new Date(data.session.endedAt).toLocaleString() : "-"}</div>

            {canManage ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                {data.session.status === "SCHEDULED" ? <button onClick={startSession}>Start session</button> : null}
                {data.session.status === "ACTIVE" ? <button onClick={endSession}>End session</button> : null}
              </div>
            ) : null}
          </div>

          <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Participants</h3>

            {canManage ? (
              <form onSubmit={addParticipant} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={participantUserId}
                  onChange={(e) => setParticipantUserId(e.target.value)}
                  placeholder="User ID"
                />
                <button>Add</button>
              </form>
            ) : null}

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">User ID</th>
                  <th align="left">Role</th>
                  <th align="left">canDraw</th>
                  <th align="left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((p) => (
                  <tr key={p.userId} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td>{p.userId}</td>
                    <td>{p.roleInSession}</td>
                    <td>{String(p.canDraw)}</td>
                    <td>
                      {canManage ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => void toggleDraw(p)}>Toggle draw</button>
                          <button onClick={() => void removeParticipant(p)}>Remove</button>
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

      {toast ? <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
