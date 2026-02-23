"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiClientError, apiPost, apiPatch, apiDelete } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";
import { Badge } from "@/src/components/ui/Badge";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { Toast } from "@/src/components/ui/Toast";

type HealthResponse = {
  ok: boolean;
  time: string;
  db: "ok" | "fail";
  version: string;
};

type UserRow = {
  id: string;
  email: string;
  role: "ADMIN" | "TUTOR" | "STUDENT";
  createdAt: string;
};

type SessionRow = {
  id: string;
  title: string;
  status: "SCHEDULED" | "ACTIVE" | "ENDED";
  scheduledStartAt: string;
  createdByUserId: string;
};

type DeviceRow = {
  id: string;
  userId: string;
  label: string | null;
  verifiedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type ExportRow = {
  id: string;
  sessionId: string;
  requestedByUserId: string;
  kind: "PDF";
  createdAt: string;
  expiresAt: string;
  deletedAt: string | null;
};

type AuditRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
};

export default function AdminPage() {
  const { user } = useMe();
  const [tab, setTab] = useState<"overview" | "users" | "sessions" | "devices" | "exports" | "audit">("overview");

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metricsEnabled, setMetricsEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [exportsList, setExportsList] = useState<ExportRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const [userQuery, setUserQuery] = useState("");
  const [deviceUserId, setDeviceUserId] = useState("");

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionStart, setNewSessionStart] = useState("");
  const [newSessionCreatorId, setNewSessionCreatorId] = useState("");

  useEffect(() => {
    if (user?.role !== "ADMIN") return;

    const run = async () => {
      try {
        const h = await apiGet<HealthResponse>("/api/health");
        setHealth(h);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load health");
      }

      try {
        await apiGet("/api/admin/metrics");
        setMetricsEnabled(true);
      } catch {
        setMetricsEnabled(false);
      }
    };

    void run();
  }, [user?.role]);

  const loadUsers = async () => {
    try {
      const result = await apiGet<{ users: UserRow[] }>(`/api/admin/users${userQuery ? `?query=${encodeURIComponent(userQuery)}` : ""}`);
      setUsers(result.users);
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed to load users", tone: "error" });
    }
  };

  const loadSessions = async () => {
    try {
      const result = await apiGet<{ sessions: SessionRow[] }>("/api/admin/sessions");
      setSessions(result.sessions);
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed to load sessions", tone: "error" });
    }
  };

  const loadDevices = async () => {
    if (!deviceUserId) return;
    try {
      const result = await apiGet<{ devices: DeviceRow[] }>(`/api/admin/users/${deviceUserId}/devices`);
      setDevices(result.devices);
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed to load devices", tone: "error" });
    }
  };

  const loadExports = async () => {
    try {
      const result = await apiGet<{ exports: ExportRow[] }>("/api/admin/exports");
      setExportsList(result.exports);
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed to load exports", tone: "error" });
    }
  };

  const loadAudit = async () => {
    try {
      const result = await apiGet<{ logs: AuditRow[] }>("/api/admin/audit?limit=100");
      setAudit(result.logs);
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed to load audit", tone: "error" });
    }
  };

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    if (tab === "users") void loadUsers();
    if (tab === "sessions") void loadSessions();
    if (tab === "devices") void loadDevices();
    if (tab === "exports") void loadExports();
    if (tab === "audit") void loadAudit();
  }, [tab, user?.role]);

  if (user?.role !== "ADMIN") {
    return (
      <div style={{ padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Admin</h1>
        <p style={{ color: "#64748b" }}>Not authorized for admin tooling.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Admin</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["overview", "users", "sessions", "devices", "exports", "audit"] as const).map((item) => (
          <button key={item} onClick={() => setTab(item)} disabled={tab === item}>
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      {error ? <div style={{ color: "#b91c1c" }}>{error}</div> : null}

      {tab === "overview" ? (
        <>
          <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>App Health</strong>
              {!health ? <Skeleton width="100px" height={18} /> : <Badge text={health.ok ? "OK" : "FAIL"} tone={health.ok ? "success" : "danger"} />}
            </div>
            <div><a href="/api/health" target="_blank" rel="noreferrer">Open /api/health</a></div>
            {health ? (
              <div style={{ fontSize: 13, color: "#475569" }}>
                DB: {health.db} | Version: {health.version} | Time: {new Date(health.time).toLocaleString()}
              </div>
            ) : null}
          </div>

          <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Metrics</strong>
              {metricsEnabled === null ? (
                <Skeleton width="120px" height={18} />
              ) : metricsEnabled ? (
                <Badge text="Configured" tone="success" />
              ) : (
                <Badge text="Not configured" tone="warning" />
              )}
            </div>
            {metricsEnabled ? (
              <a href="/api/admin/metrics" target="_blank" rel="noreferrer">Open /api/admin/metrics</a>
            ) : (
              <div style={{ fontSize: 13, color: "#64748b" }}>Metrics endpoint unavailable or blocked.</div>
            )}
          </div>
        </>
      ) : null}

      {tab === "users" ? (
        <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
          <strong>Users</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="Search user/email" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
            <button onClick={() => void loadUsers()}>Search</button>
          </div>
          <div style={{ display: "grid", gap: 8, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>Create user</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input placeholder="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
              <input placeholder="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
              <button
                onClick={async () => {
                  try {
                    // New users are created as STUDENT by default; admin can elevate later.
                    await apiPost("/api/admin/users", { email: newUserEmail, password: newUserPassword, role: "STUDENT" });
                    setNewUserEmail("");
                    setNewUserPassword("");
                    setToast({ text: "User created", tone: "success" });
                    await loadUsers();
                  } catch (err) {
                    setToast({ text: err instanceof ApiClientError ? err.message : "Failed to create user", tone: "error" });
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {users.map((u) => (
              <div key={u.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{u.email}</span>
                  <Badge text={u.role} tone={u.role === "ADMIN" ? "danger" : u.role === "TUTOR" ? "info" : "neutral"} />
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>id: {u.id}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={async () => {
                      await apiPatch(`/api/admin/users/${u.id}`, { role: "STUDENT" });
                      await loadUsers();
                    }}
                    disabled={u.role === "STUDENT"}
                  >
                    Set Student
                  </button>
                  <button
                    onClick={async () => {
                      await apiPatch(`/api/admin/users/${u.id}`, { role: "TUTOR" });
                      await loadUsers();
                    }}
                    disabled={u.role === "TUTOR"}
                  >
                    Set Tutor
                  </button>
                  <button
                    onClick={async () => {
                      await apiPatch(`/api/admin/users/${u.id}`, { role: "ADMIN" });
                      await loadUsers();
                    }}
                    disabled={u.role === "ADMIN"}
                  >
                    Set Admin
                  </button>
                  <button onClick={async () => {
                    await apiDelete(`/api/admin/users/${u.id}`);
                    await loadUsers();
                  }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "sessions" ? (
        <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
          <strong>Sessions</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="title" value={newSessionTitle} onChange={(e) => setNewSessionTitle(e.target.value)} />
            <input type="datetime-local" value={newSessionStart} onChange={(e) => setNewSessionStart(e.target.value)} />
            <input placeholder="creator userId (optional)" value={newSessionCreatorId} onChange={(e) => setNewSessionCreatorId(e.target.value)} />
            <button
              onClick={async () => {
                await apiPost("/api/admin/sessions", {
                  title: newSessionTitle,
                  scheduledStartAt: new Date(newSessionStart).toISOString(),
                  createdByUserId: newSessionCreatorId || undefined,
                });
                setNewSessionTitle("");
                setNewSessionStart("");
                setNewSessionCreatorId("");
                await loadSessions();
              }}
            >
              Create
            </button>
            <button onClick={() => void loadSessions()}>Refresh</button>
          </div>
          {sessions.map((s) => (
            <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{s.title}</span>
                <Badge text={s.status} tone={s.status === "ACTIVE" ? "success" : s.status === "SCHEDULED" ? "warning" : "neutral"} />
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{s.id}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={async () => { await apiPatch(`/api/admin/sessions/${s.id}`, { status: "SCHEDULED" }); await loadSessions(); }}>Set Scheduled</button>
                <button onClick={async () => { await apiPatch(`/api/admin/sessions/${s.id}`, { status: "ACTIVE" }); await loadSessions(); }}>Set Active</button>
                <button onClick={async () => { await apiPatch(`/api/admin/sessions/${s.id}`, { status: "ENDED" }); await loadSessions(); }}>Set Ended</button>
                <button onClick={async () => { await apiDelete(`/api/admin/sessions/${s.id}`); await loadSessions(); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "devices" ? (
        <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
          <strong>Devices</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <input placeholder="User ID" value={deviceUserId} onChange={(e) => setDeviceUserId(e.target.value)} />
            <button onClick={() => void loadDevices()}>Load</button>
          </div>
          {devices.map((d) => (
            <div key={d.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "grid", gap: 6 }}>
              <div>{d.label ?? "Unknown device"}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{d.id}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={async () => { await apiPatch(`/api/admin/devices/${d.id}`, { revoke: true }); await loadDevices(); }}>Revoke</button>
                <button onClick={async () => { await apiPatch(`/api/admin/devices/${d.id}`, { revoke: false }); await loadDevices(); }}>Unrevoke</button>
                <button onClick={async () => { await apiDelete(`/api/admin/devices/${d.id}`); await loadDevices(); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "exports" ? (
        <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
          <strong>Exports</strong>
          <button onClick={() => void loadExports()}>Refresh</button>
          {exportsList.map((exp) => (
            <div key={exp.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, display: "grid", gap: 6 }}>
              <div>{exp.id}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Session: {exp.sessionId}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/api/exports/${exp.id}/download`} target="_blank" rel="noreferrer">Download</a>
                <button onClick={async () => { await apiDelete(`/api/admin/exports/${exp.id}`); await loadExports(); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "audit" ? (
        <div style={{ border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
          <strong>Audit</strong>
          <button onClick={() => void loadAudit()}>Refresh</button>
          {audit.map((log) => (
            <div key={log.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 12 }}>{new Date(log.createdAt).toLocaleString()}</div>
              <div><strong>{log.action}</strong> {log.targetType}:{log.targetId}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>actor: {log.actorUserId ?? "system"}</div>
            </div>
          ))}
        </div>
      ) : null}

      {toast ? <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
