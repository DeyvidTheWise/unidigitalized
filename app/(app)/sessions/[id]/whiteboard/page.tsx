"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useParams } from "next/navigation";
import { applyOp } from "@/src/whiteboard/applyOp";
import { createEmptySceneState, sceneFromUnknown, type SceneState } from "@/src/whiteboard/model";
import type { WhiteboardOpType } from "@/src/whiteboard/ops";
import { WhiteboardRenderer } from "@/src/whiteboard/renderer";
import type { PreviewPrimitive } from "@/src/whiteboard/renderer";
import { createEraserTool } from "@/src/whiteboard/tools/eraserTool";
import { createHighlighterTool } from "@/src/whiteboard/tools/highlighterTool";
import { createPenTool } from "@/src/whiteboard/tools/penTool";
import { createSelectMoveTool } from "@/src/whiteboard/tools/selectMoveTool";
import { createShapeTool, type ShapeKind } from "@/src/whiteboard/tools/shapeTool";
import { createTextTool } from "@/src/whiteboard/tools/textTool";
import type { PointerInfo, ToolName, WhiteboardTool } from "@/src/whiteboard/tools/toolTypes";
import {
  WhiteboardWsClient,
  type BroadcastMessage,
  type ConnectionStatus,
  type WelcomeMessage,
} from "@/src/whiteboard/wsClient";
import { apiGet, apiPost, ApiClientError } from "@/src/lib/client/api";
import { useMe } from "@/src/lib/client/auth";
import { Drawer } from "@/src/components/Drawer";
import { Toast } from "@/src/components/Toast";

type SessionDetailsResponse = {
  session: {
    id: string;
    status: "SCHEDULED" | "ACTIVE" | "ENDED";
  };
  participants: Array<{
    userId: string;
    roleInSession: "TUTOR" | "STUDENT";
    canDraw: boolean;
    leftAt: string | null;
  }>;
};

type ExportItem = {
  id: string;
  kind: "PDF";
  createdAt: string;
  expiresAt: string;
};

type ExportsResponse = {
  exports: ExportItem[];
};

type CursorView = {
  userId: string;
  x: number;
  y: number;
};

type TextInputState = {
  x: number;
  y: number;
  value: string;
};

function pointFromPointer(event: ReactPointerEvent<HTMLCanvasElement>): PointerInfo {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    t: Date.now(),
  };
}

function hydrateSceneFromWelcome(message: WelcomeMessage): SceneState {
  let state = message.snapshot?.state ? sceneFromUnknown(message.snapshot.state) : createEmptySceneState();
  const sortedOps = [...message.opsAfterSnapshot].sort((a, b) => a.serverSeq - b.serverSeq);

  for (const op of sortedOps) {
    state = applyOp(state, op.opType, op.payload);
    state = {
      ...state,
      version: { lastServerSeq: op.serverSeq },
    };
  }

  if (message.lastServerSeqFinal > state.version.lastServerSeq) {
    state = {
      ...state,
      version: { lastServerSeq: message.lastServerSeqFinal },
    };
  }

  return state;
}

export default function WhiteboardPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const { user } = useMe();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WhiteboardRenderer | null>(null);
  const wsClientRef = useRef<WhiteboardWsClient | null>(null);
  const sceneRef = useRef<SceneState>(createEmptySceneState());
  const pointerDownRef = useRef(false);
  const textCommitRef = useRef<((text: string) => void) | null>(null);

  const remoteCursorMapRef = useRef<Map<string, CursorView>>(new Map());
  const cursorRafRef = useRef<number | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");
  const [toolName, setToolName] = useState<ToolName>("pen");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect");

  const [sessionStatus, setSessionStatus] = useState<"SCHEDULED" | "ACTIVE" | "ENDED" | "UNKNOWN">("UNKNOWN");
  const [presenceUsers, setPresenceUsers] = useState<string[]>([]);
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>("Loading permissions...");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [canDraw, setCanDraw] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<CursorView[]>([]);
  const [isResyncing, setIsResyncing] = useState(false);

  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [exportsOpen, setExportsOpen] = useState(false);
  const [exportsLoading, setExportsLoading] = useState(false);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [creatingExport, setCreatingExport] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const canExport = user?.role === "ADMIN" || user?.role === "TUTOR";

  const activeTool: WhiteboardTool = useMemo(() => {
    if (toolName === "pen") return createPenTool();
    if (toolName === "highlighter") return createHighlighterTool();
    if (toolName === "eraser") return createEraserTool();
    if (toolName === "shape") return createShapeTool(shapeKind);
    if (toolName === "select") return createSelectMoveTool();
    return createTextTool();
  }, [toolName, shapeKind]);

  const updateRemoteCursorState = useCallback(() => {
    if (cursorRafRef.current !== null) return;
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = null;
      setRemoteCursors([...remoteCursorMapRef.current.values()]);
    });
  }, []);

  const loadSessionPermissions = useCallback(async () => {
    if (!sessionId) return;

    try {
      const sessionData = await apiGet<SessionDetailsResponse>(`/api/sessions/${sessionId}`);
      setSessionStatus(sessionData.session.status);

      const me = user;
      if (!me) {
        setReadOnlyReason("No access");
        setCanDraw(false);
        return;
      }

      setCurrentUserId(me.id);
      const participant = sessionData.participants.find((entry) => entry.userId === me.id && entry.leftAt === null);
      const activeSession = sessionData.session.status === "ACTIVE";

      const drawAllowed =
        activeSession &&
        (me.role === "ADMIN" || Boolean(participant && (participant.canDraw || participant.roleInSession === "TUTOR")));

      setCanDraw(drawAllowed);

      if (sessionData.session.status === "ENDED") {
        setReadOnlyReason("Session ended: board is read-only.");
      } else if (!activeSession) {
        setReadOnlyReason("Session is not active.");
      } else if (!drawAllowed) {
        setReadOnlyReason("View-only: drawing disabled by tutor.");
      } else {
        setReadOnlyReason(null);
      }
    } catch (err) {
      setErrorText(err instanceof ApiClientError ? err.message : "Failed to load session permissions.");
      setCanDraw(false);
      setReadOnlyReason("No access");
    }
  }, [sessionId, user]);

  const loadExports = useCallback(async () => {
    if (!sessionId || !canExport) return;

    setExportsLoading(true);
    try {
      const response = await apiGet<ExportsResponse>(`/api/sessions/${sessionId}/exports`);
      setExports(response.exports);
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Failed to load exports", tone: "error" });
    } finally {
      setExportsLoading(false);
    }
  }, [canExport, sessionId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WhiteboardRenderer();
    renderer.init(canvas, sceneRef.current);
    rendererRef.current = renderer;

    const observer = new ResizeObserver(() => {
      if (!canvasRef.current || !rendererRef.current) return;
      rendererRef.current.resize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    });

    observer.observe(canvas);
    renderer.resize(canvas.clientWidth || 1, canvas.clientHeight || 1);

    return () => {
      observer.disconnect();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadSessionPermissions();
  }, [loadSessionPermissions]);

  useEffect(() => {
    if (!sessionId) return;

    const wsClient = new WhiteboardWsClient(sessionId, {
      onStatus: setConnectionStatus,
      onWelcome: (welcome: WelcomeMessage) => {
        const hydrated = hydrateSceneFromWelcome(welcome);
        sceneRef.current = hydrated;
        rendererRef.current?.setCommittedState(hydrated);
        setPresenceUsers(welcome.presence.map((p) => p.userId));

        if (welcome.needsResync) {
          setErrorText("Resyncing board state from latest snapshot...");
        }
      },
      onBroadcast: (message: BroadcastMessage) => {
        const next = applyOp(sceneRef.current, message.opType, message.payload);
        sceneRef.current = {
          ...next,
          version: { lastServerSeq: message.serverSeq },
        };
        rendererRef.current?.setCommittedState(sceneRef.current);
      },
      onPresence: (presence) => {
        setPresenceUsers(presence.users.map((u) => u.userId));
      },
      onCursor: (cursor) => {
        if (cursor.userId === currentUserId) return;
        remoteCursorMapRef.current.set(cursor.userId, {
          userId: cursor.userId,
          x: cursor.x,
          y: cursor.y,
        });
        updateRemoteCursorState();
      },
      onRejected: (reject) => setErrorText(`${reject.code}: ${reject.message}`),
      onResyncingChange: (resyncing) => {
        setIsResyncing(resyncing);
        if (!resyncing) {
          setErrorText((prev) => (prev === "Resyncing board state from latest snapshot..." ? null : prev));
        }
      },
    });

    wsClientRef.current = wsClient;
    wsClient.connect();

    return () => {
      wsClient.disconnect();
      wsClientRef.current = null;
      remoteCursorMapRef.current.clear();
      setRemoteCursors([]);
    };
  }, [currentUserId, sessionId, updateRemoteCursorState]);

  const submitOp = useCallback((opType: WhiteboardOpType, payload: unknown) => {
    wsClientRef.current?.submitOp(opType, payload);
  }, []);

  const requestTextInput = useCallback((point: PointerInfo, onCommit: (text: string) => void) => {
    textCommitRef.current = onCommit;
    setTextInput({ x: point.x, y: point.y, value: "" });
  }, []);

  const toolContext = useMemo(
    () => ({
      userId: currentUserId,
      getScene: () => sceneRef.current,
      submitOp: ({ opType, payload }: { opType: WhiteboardOpType; payload: unknown }) => submitOp(opType, payload),
      setLivePreview: (preview: PreviewPrimitive | null) => rendererRef.current?.setLivePreview(preview),
      requestTextInput,
    }),
    [currentUserId, requestTextInput, submitOp],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = pointFromPointer(event);
      wsClientRef.current?.sendCursor(point.x, point.y);
      if (!canDraw || !currentUserId) return;

      pointerDownRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      activeTool.onPointerDown(point, toolContext);
    },
    [activeTool, canDraw, currentUserId, toolContext],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = pointFromPointer(event);
      wsClientRef.current?.sendCursor(point.x, point.y);
      if (!canDraw || !currentUserId || !pointerDownRef.current) return;
      activeTool.onPointerMove(point, toolContext);
    },
    [activeTool, canDraw, currentUserId, toolContext],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = pointFromPointer(event);
      wsClientRef.current?.sendCursor(point.x, point.y);

      if (!canDraw || !currentUserId) {
        pointerDownRef.current = false;
        return;
      }

      if (pointerDownRef.current) {
        activeTool.onPointerUp(point, toolContext);
      }

      pointerDownRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
    },
    [activeTool, canDraw, currentUserId, toolContext],
  );

  const commitTextInput = useCallback(() => {
    if (!textInput) return;
    const callback = textCommitRef.current;
    if (callback) callback(textInput.value);

    textCommitRef.current = null;
    setTextInput(null);
  }, [textInput]);

  const createExport = async () => {
    if (!sessionId) return;
    setCreatingExport(true);
    try {
      await apiPost<{ exportId: string; expiresAt: string }>(`/api/sessions/${sessionId}/export/pdf`);
      setToast({ text: "Export created", tone: "success" });
      await loadExports();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : "Export failed", tone: "error" });
    } finally {
      setCreatingExport(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f8fafc", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 12,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid #d1d5db",
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 12,
          display: "grid",
          gap: 4,
        }}
      >
        <div>Session: {sessionStatus}</div>
        <div>WS: {connectionStatus}</div>
        <div>Presence: {presenceUsers.length}</div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "rgba(255,255,255,0.94)",
          border: "1px solid #d1d5db",
          borderRadius: 10,
          padding: "8px 10px",
          zIndex: 12,
        }}
      >
        <button onClick={() => setToolName("pen")} disabled={toolName === "pen"}>Pen</button>
        <button onClick={() => setToolName("highlighter")} disabled={toolName === "highlighter"}>Highlighter</button>
        <button onClick={() => setToolName("eraser")} disabled={toolName === "eraser"}>Eraser</button>
        <button onClick={() => setToolName("shape")} disabled={toolName === "shape"}>Shape</button>
        <button onClick={() => setToolName("select")} disabled={toolName === "select"}>Select</button>
        <button onClick={() => setToolName("text")} disabled={toolName === "text"}>Text</button>
        {toolName === "shape" ? (
          <select value={shapeKind} onChange={(e) => setShapeKind(e.target.value as ShapeKind)}>
            <option value="rect">Rect</option>
            <option value="ellipse">Ellipse</option>
            <option value="line">Line</option>
          </select>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          gap: 8,
          zIndex: 12,
        }}
      >
        <button onClick={() => setParticipantsOpen(true)}>Participants</button>
        {canExport ? <button onClick={() => { setExportsOpen(true); void loadExports(); }}>Exports</button> : null}
      </div>

      {readOnlyReason ? (
        <div style={{ position: "absolute", top: 56, left: 10, zIndex: 12, background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, padding: "6px 10px", color: "#9a3412", fontSize: 13 }}>
          {readOnlyReason}
        </div>
      ) : null}

      {isResyncing ? (
        <div style={{ position: "absolute", top: 88, left: 10, zIndex: 12, background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "6px 10px", color: "#1d4ed8", fontSize: 12 }}>
          Resyncing board...
        </div>
      ) : null}

      {errorText ? (
        <div style={{ position: "absolute", bottom: 14, left: 10, zIndex: 12, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "6px 10px", color: "#991b1b", fontSize: 12 }}>
          {errorText}
        </div>
      ) : null}

      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", touchAction: "none", cursor: canDraw ? "crosshair" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {remoteCursors.map((cursor) => (
        <div key={cursor.userId} style={{ position: "absolute", left: cursor.x, top: cursor.y, width: 8, height: 8, borderRadius: "50%", background: "#dc2626", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />
      ))}

      {textInput ? (
        <input
          autoFocus
          value={textInput.value}
          onChange={(event) => setTextInput((prev) => (prev ? { ...prev, value: event.target.value } : prev))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTextInput();
            }
            if (event.key === "Escape") {
              textCommitRef.current = null;
              setTextInput(null);
            }
          }}
          onBlur={commitTextInput}
          style={{ position: "absolute", left: textInput.x, top: textInput.y - 20, zIndex: 20, minWidth: 160 }}
        />
      ) : null}

      <Drawer open={participantsOpen} title="Participants" onClose={() => setParticipantsOpen(false)}>
        {presenceUsers.length === 0 ? <div style={{ color: "#64748b" }}>No one online.</div> : null}
        {presenceUsers.map((userId) => (
          <div key={userId} style={{ padding: "6px 0", borderBottom: "1px solid #e5e7eb", fontSize: 13 }}>{userId}</div>
        ))}
      </Drawer>

      <Drawer open={exportsOpen} title="Exports" onClose={() => setExportsOpen(false)}>
        {canExport ? (
          <div style={{ display: "grid", gap: 10 }}>
            <button disabled={creatingExport} onClick={() => void createExport()}>
              {creatingExport ? "Exporting..." : "Export PDF"}
            </button>

            {exportsLoading ? <div>Loading exports...</div> : null}

            {exports.map((exp) => (
              <div key={exp.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12 }}>
                <div>ID: {exp.id}</div>
                <div>Expires: {new Date(exp.expiresAt).toLocaleString()}</div>
                <a href={`/api/exports/${exp.id}/download`} target="_blank" rel="noreferrer">Download PDF</a>
              </div>
            ))}

            {!exportsLoading && exports.length === 0 ? <div style={{ color: "#64748b" }}>No exports yet.</div> : null}
          </div>
        ) : (
          <div>Not allowed.</div>
        )}
      </Drawer>

      {toast ? <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
