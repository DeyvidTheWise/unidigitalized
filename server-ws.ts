import "dotenv/config";
import { WebSocketServer } from "ws";
import type { RawData, WebSocket } from "ws";
import type { Prisma } from "@prisma/client";
import { authenticateUpgradeRequest } from "./src/ws/auth";
import { shouldBroadcastCursor } from "./src/ws/cursor";
import { ingestOp } from "./src/ws/opIngest";
import { parseClientMessage } from "./src/ws/protocol";
import { broadcast, currentPresence, joinSessionRoom, removeSocket, send, attachSocket, getSocketMeta } from "./src/ws/rooms";
import { loadJoinState } from "./src/ws/stateLoad";

const WS_PORT = Number.parseInt(process.env.WS_PORT ?? "3001", 10);

function safeIp(headers: Record<string, string | string[] | undefined>): string | null {
  const forwarded = headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) {
    return forwarded[0] ?? null;
  }
  return forwarded ?? null;
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (socket: WebSocket, request) => {
  const auth = authenticateUpgradeRequest(request);
  if (!auth.ok) {
    socket.close(auth.closeCode, auth.reason);
    return;
  }

  attachSocket(socket, {
    userId: auth.user.userId,
    role: auth.user.role,
    request,
    sessionId: null,
    lastCursorTs: 0,
  });

  socket.on("message", async (raw: RawData) => {
    const parsed = parseClientMessage(raw.toString());
    if (!parsed.ok) {
      send(socket, {
        type: "ERROR",
        code: "VALIDATION_ERROR",
        message: parsed.error,
      });
      return;
    }

    const meta = getSocketMeta(socket);
    if (!meta) {
      socket.close(1011, "INTERNAL_ERROR");
      return;
    }

    const message = parsed.message;

    if (message.type === "PING") {
      send(socket, { type: "PONG" });
      return;
    }

    if (message.type === "HELLO") {
      const joinResult = await joinSessionRoom(socket, message.sessionId);
      if (!joinResult.ok) {
        send(socket, {
          type: "ERROR",
          code: "VALIDATION_ERROR",
          message: joinResult.message,
        });
        return;
      }

      const state = await loadJoinState(message.sessionId);
      const presence = currentPresence(message.sessionId);

      send(socket, {
        type: "WELCOME",
        userId: meta.userId,
        sessionId: message.sessionId,
        presence,
        lastServerSeq: state.lastServerSeq,
        stateSnapshot: state.stateSnapshot,
        ops: state.ops,
        truncated: state.truncated,
      });

      broadcast(message.sessionId, {
        type: "PRESENCE",
        sessionId: message.sessionId,
        users: currentPresence(message.sessionId),
      });

      return;
    }

    if (!meta.sessionId || meta.sessionId !== message.sessionId) {
      send(socket, {
        type: "ERROR",
        code: "VALIDATION_ERROR",
        message: "Join session with HELLO before sending session messages.",
      });
      return;
    }

    if (message.type === "CURSOR") {
      if (!shouldBroadcastCursor(meta)) {
        return;
      }

      broadcast(message.sessionId, {
        type: "CURSOR_BROADCAST",
        sessionId: message.sessionId,
        userId: meta.userId,
        x: message.x,
        y: message.y,
      });
      return;
    }

    if (message.type === "OP_SUBMIT") {
      const ingestResult = await ingestOp({
        sessionId: message.sessionId,
        actorUserId: meta.userId,
        actorRole: meta.role,
        clientOpId: message.clientOpId,
        opType: message.opType,
        payload: message.payload as Prisma.InputJsonValue,
        ip: safeIp(request.headers as Record<string, string | string[] | undefined>),
        userAgent: request.headers["user-agent"] ?? null,
      });

      if (!ingestResult.accepted) {
        send(socket, {
          type: "OP_REJECTED",
          clientOpId: message.clientOpId,
          code: ingestResult.code,
          message: ingestResult.message,
        });
        return;
      }

      send(socket, {
        type: "OP_ACCEPTED",
        clientOpId: message.clientOpId,
        serverSeq: ingestResult.serverSeq,
      });

      if (ingestResult.existing) {
        return;
      }

      broadcast(message.sessionId, {
        type: "OP_BROADCAST",
        serverSeq: ingestResult.serverSeq,
        actorUserId: ingestResult.actorUserId,
        opType: ingestResult.opType,
        payload: ingestResult.payload,
        createdAt: ingestResult.createdAt,
      });
    }
  });

  socket.on("close", () => {
    const sessionId = removeSocket(socket);
    if (sessionId) {
      broadcast(sessionId, {
        type: "PRESENCE",
        sessionId,
        users: currentPresence(sessionId),
      });
    }
  });
});

console.log(`WS server listening on ws://localhost:${WS_PORT}`);
