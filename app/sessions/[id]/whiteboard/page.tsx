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
import { WhiteboardWsClient, type BroadcastMessage, type ConnectionStatus, type WelcomeMessage } from "@/src/whiteboard/wsClient";

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

type MeResponse = {
  user: {
    id: string;
    role: "ADMIN" | "TUTOR" | "STUDENT";
  };
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
  let state = sceneFromUnknown(message.stateSnapshot);
  const sortedOps = [...message.ops].sort((a, b) => a.serverSeq - b.serverSeq);

  for (const op of sortedOps) {
    state = applyOp(state, op.opType, op.payload);
    state = {
      ...state,
      version: { lastServerSeq: op.serverSeq },
    };
  }

  if (message.lastServerSeq > state.version.lastServerSeq) {
    state = {
      ...state,
      version: { lastServerSeq: message.lastServerSeq },
    };
  }

  return state;
}

export default function WhiteboardPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;

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
  const [presenceCount, setPresenceCount] = useState(0);
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>("Loading permissions...");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [canDraw, setCanDraw] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<CursorView[]>([]);

  const activeTool: WhiteboardTool = useMemo(() => {
    if (toolName === "pen") return createPenTool();
    if (toolName === "highlighter") return createHighlighterTool();
    if (toolName === "eraser") return createEraserTool();
    if (toolName === "shape") return createShapeTool(shapeKind);
    if (toolName === "select") return createSelectMoveTool();
    return createTextTool();
  }, [toolName, shapeKind]);

  const updateRemoteCursorState = useCallback(() => {
    if (cursorRafRef.current !== null) {
      return;
    }

    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = null;
      setRemoteCursors([...remoteCursorMapRef.current.values()]);
    });
  }, []);

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
    if (!sessionId) return;

    let cancelled = false;

    async function loadPermissions() {
      try {
        const [meResponse, sessionResponse] = await Promise.all([
          fetch("/api/auth/me", { method: "GET" }),
          fetch(`/api/sessions/${sessionId}`, { method: "GET" }),
        ]);

        if (!meResponse.ok || !sessionResponse.ok) {
          if (!cancelled) {
            setErrorText("Failed to load whiteboard permissions.");
            setCanDraw(false);
            setReadOnlyReason("No access");
          }
          return;
        }

        const meData = (await meResponse.json()) as MeResponse;
        const sessionData = (await sessionResponse.json()) as SessionDetailsResponse;

        if (cancelled) return;

        setCurrentUserId(meData.user.id);

        const participant = sessionData.participants.find((entry) => entry.userId === meData.user.id && entry.leftAt === null);
        const activeSession = sessionData.session.status === "ACTIVE";
        const drawAllowed =
          activeSession &&
          (meData.user.role === "ADMIN" ||
            Boolean(participant && (participant.canDraw || participant.roleInSession === "TUTOR")));

        setCanDraw(drawAllowed);

        if (!activeSession) {
          setReadOnlyReason("Session is not active.");
        } else if (!drawAllowed) {
          setReadOnlyReason("Read-only: drawing permission is disabled.");
        } else {
          setReadOnlyReason(null);
        }
      } catch {
        if (!cancelled) {
          setErrorText("Failed to load whiteboard permissions.");
          setCanDraw(false);
          setReadOnlyReason("No access");
        }
      }
    }

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const wsClient = new WhiteboardWsClient(sessionId, {
      onStatus: (status) => {
        setConnectionStatus(status);
      },
      onWelcome: (welcome: WelcomeMessage) => {
        const hydrated = hydrateSceneFromWelcome(welcome);
        sceneRef.current = hydrated;
        rendererRef.current?.setCommittedState(hydrated);

        setPresenceCount(welcome.presence.length);

        if (welcome.truncated) {
          setErrorText("History was truncated while hydrating board state.");
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
        setPresenceCount(presence.users.length);
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
      onRejected: (reject) => {
        setErrorText(`${reject.code}: ${reject.message}`);
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

  const submitOp = useCallback(
    (opType: WhiteboardOpType, payload: unknown) => {
      wsClientRef.current?.submitOp(opType, payload);
    },
    [],
  );

  const requestTextInput = useCallback((point: PointerInfo, onCommit: (text: string) => void) => {
    textCommitRef.current = onCommit;
    setTextInput({
      x: point.x,
      y: point.y,
      value: "",
    });
  }, []);

  const toolContext = useMemo(
    () => ({
      userId: currentUserId,
      getScene: () => sceneRef.current,
      submitOp: ({ opType, payload }: { opType: WhiteboardOpType; payload: unknown }) => submitOp(opType, payload),
      setLivePreview: (preview: PreviewPrimitive | null) => {
        rendererRef.current?.setLivePreview(preview);
      },
      requestTextInput,
    }),
    [currentUserId, requestTextInput, submitOp],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = pointFromPointer(event);
      wsClientRef.current?.sendCursor(point.x, point.y);

      if (!canDraw || !currentUserId) {
        return;
      }

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

      if (!canDraw || !currentUserId || !pointerDownRef.current) {
        return;
      }

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
      } catch {
        // ignore release errors when pointer capture is already cleared
      }
    },
    [activeTool, canDraw, currentUserId, toolContext],
  );

  const commitTextInput = useCallback(() => {
    if (!textInput) return;

    const callback = textCommitRef.current;
    if (callback) {
      callback(textInput.value);
    }

    textCommitRef.current = null;
    setTextInput(null);
  }, [textInput]);

  const cancelTextInput = useCallback(() => {
    textCommitRef.current = null;
    setTextInput(null);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f8fafc", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #d1d5db",
          borderRadius: 10,
          padding: "8px 10px",
          zIndex: 5,
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

        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
          <span>Presence: {presenceCount}</span>
          <span>Status: {connectionStatus}</span>
        </div>
      </div>

      {readOnlyReason ? (
        <div
          style={{
            position: "absolute",
            top: 56,
            left: 12,
            background: "#fff7ed",
            color: "#9a3412",
            border: "1px solid #fdba74",
            borderRadius: 8,
            padding: "6px 10px",
            zIndex: 5,
            fontSize: 13,
          }}
        >
          {readOnlyReason}
        </div>
      ) : null}

      {errorText ? (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: 12,
            background: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fca5a5",
            borderRadius: 8,
            padding: "6px 10px",
            zIndex: 5,
            maxWidth: 480,
            fontSize: 12,
          }}
        >
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
        <div
          key={cursor.userId}
          style={{
            position: "absolute",
            left: cursor.x,
            top: cursor.y,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#dc2626",
            pointerEvents: "none",
            transform: "translate(-50%, -50%)",
          }}
          title={cursor.userId}
        />
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
              cancelTextInput();
            }
          }}
          onBlur={commitTextInput}
          style={{
            position: "absolute",
            left: textInput.x,
            top: textInput.y - 20,
            zIndex: 6,
            border: "1px solid #94a3b8",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 16,
            minWidth: 160,
          }}
          placeholder="Type text"
        />
      ) : null}
    </div>
  );
}
