import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import type { RawData, WebSocket } from "ws";
import type { Prisma } from "@prisma/client";
import { authenticateUpgradeRequest } from "./src/ws/auth";
import { startSnapshotWorker } from "./src/snapshots/snapshotWorker";
import { shouldBroadcastCursor } from "./src/ws/cursor";
import { ingestOp } from "./src/ws/opIngest";
import { parseClientMessage } from "./src/ws/protocol";
import { activeConnectionCount, attachSocket, broadcast, currentPresence, getSocketMeta, joinSessionRoom, removeSocket, send } from "./src/ws/rooms";
import { loadJoinState } from "./src/ws/stateLoad";
import { childLogger, logger } from "./src/lib/logging/logger";
import { inc } from "./src/lib/metrics/metrics";

const WS_PORT = Number.parseInt(process.env.WS_PORT ?? "3001", 10);
const WS_HEALTH_PORT = Number.parseInt(process.env.WS_HEALTH_PORT ?? "3002", 10);
const WS_MAX_MESSAGE_BYTES = Number.parseInt(process.env.WS_MAX_MESSAGE_BYTES ?? "65536", 10);
const WS_MAX_OP_PAYLOAD_BYTES = Number.parseInt(process.env.WS_MAX_OP_PAYLOAD_BYTES ?? "32768", 10);
const WS_MAX_MESSAGES_PER_SECOND = Number.parseInt(process.env.WS_MAX_MESSAGES_PER_SECOND ?? "60", 10);
const startTime = Date.now();

function safeIp(headers: Record<string, string | string[] | undefined>): string | null {
  const forwarded = headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) {
    return forwarded[0] ?? null;
  }
  return forwarded ?? null;
}

function toRawLength(raw: RawData): number {
  if (typeof raw === "string") {
    return Buffer.byteLength(raw);
  }
  if (raw instanceof ArrayBuffer) {
    return raw.byteLength;
  }
  if (Array.isArray(raw)) {
    return raw.reduce((acc, part) => acc + (part?.byteLength ?? 0), 0);
  }
  return raw.byteLength;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

const healthServer = createServer((request, response) => {
  if (request.url !== "/health") {
    writeJson(response, 404, { ok: false });
    return;
  }

  writeJson(response, 200, {
    ok: true,
    connectionsActive: activeConnectionCount(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    time: new Date().toISOString(),
  });
});

healthServer.listen(WS_HEALTH_PORT);

const wss = new WebSocketServer({ port: WS_PORT, maxPayload: WS_MAX_MESSAGE_BYTES });

wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
  const auth = authenticateUpgradeRequest(request);
  if (!auth.ok) {
    socket.close(auth.closeCode, auth.reason);
    return;
  }

  const wsConnId = randomUUID();
  const connectedAt = Date.now();
  const connection = {
    wsConnId,
    connectedAt,
    windowStartMs: connectedAt,
    windowMessages: 0,
  };

  attachSocket(socket, {
    wsConnId,
    userId: auth.user.userId,
    role: auth.user.role,
    request,
    sessionId: null,
    lastCursorTs: 0,
  });

  const connLog = childLogger({
    wsConnId,
    userId: auth.user.userId,
    ip: safeIp(request.headers as Record<string, string | string[] | undefined>),
  });

  inc("ws_connections_active", undefined, 1);
  inc("ws_messages_total", { type: "CONNECT" });
  connLog.info({ path: request.url ?? "/" }, "ws_connect");

  socket.on("message", async (raw: RawData) => {
    try {
      const rawLength = toRawLength(raw);
      if (rawLength > WS_MAX_MESSAGE_BYTES) {
        connLog.warn({ rawLength }, "ws_message_too_large");
        socket.close(1009, "MESSAGE_TOO_LARGE");
        return;
      }

      const now = Date.now();
      if (now - connection.windowStartMs >= 1_000) {
        connection.windowStartMs = now;
        connection.windowMessages = 0;
      }

      const rawText = raw.toString();
      const parsed = parseClientMessage(rawText);
      if (!parsed.ok) {
        inc("ws_messages_total", { type: "INVALID" });
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
    const messageCost = message.type === "CURSOR" ? 0.25 : 1;
    connection.windowMessages += messageCost;
    if (connection.windowMessages > WS_MAX_MESSAGES_PER_SECOND) {
      connLog.warn({ limit: WS_MAX_MESSAGES_PER_SECOND }, "ws_rate_limit_exceeded");
      socket.close(1013, "RATE_LIMITED");
      return;
    }

    inc("ws_messages_total", { type: message.type });

    if (message.type === "PING") {
      send(socket, { type: "PONG" });
      return;
    }

    if (message.type === "HELLO") {
      const joinResult = await joinSessionRoom(socket, message.sessionId);
      if (!joinResult.ok) {
        connLog.warn({ sessionId: message.sessionId, code: joinResult.code }, "ws_join_rejected");
        send(socket, {
          type: "ERROR",
          code: "VALIDATION_ERROR",
          message: joinResult.message,
        });
        return;
      }

      const state = await loadJoinState(message.sessionId);
      const presence = currentPresence(message.sessionId);
      connLog.info({ sessionId: message.sessionId, needsResync: state.needsResync }, "ws_join");

      send(socket, {
        type: "WELCOME",
        userId: meta.userId,
        sessionId: message.sessionId,
        presence,
        snapshot: state.snapshot,
        opsAfterSnapshot: state.opsAfterSnapshot,
        lastServerSeqFinal: state.lastServerSeqFinal,
        needsResync: state.needsResync,
      });

      broadcast(message.sessionId, {
        type: "PRESENCE",
        sessionId: message.sessionId,
        users: currentPresence(message.sessionId),
      });
      inc("ws_broadcast_total");

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
      inc("ws_broadcast_total");
      return;
    }

      if (message.type === "OP_SUBMIT") {
        const payloadBytes = Buffer.byteLength(JSON.stringify(message.payload ?? null));
        if (payloadBytes > WS_MAX_OP_PAYLOAD_BYTES) {
          inc("ws_op_submit_total", { result: "rejected" });
          send(socket, {
            type: "OP_REJECTED",
            clientOpId: message.clientOpId,
            code: "VALIDATION_ERROR",
            message: "Operation payload too large.",
          });
          return;
        }

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
          inc("ws_op_submit_total", { result: "rejected" });
          connLog.warn(
            {
              sessionId: message.sessionId,
              code: ingestResult.code,
              clientOpId: message.clientOpId,
            },
            "ws_op_rejected",
          );
          send(socket, {
            type: "OP_REJECTED",
            clientOpId: message.clientOpId,
            code: ingestResult.code,
            message: ingestResult.message,
          });
          return;
        }
        inc("ws_op_submit_total", { result: "accepted" });

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
        inc("ws_broadcast_total");
      }
    } catch (error) {
      connLog.error(
        {
          err: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        },
        "ws_message_failed",
      );
      send(socket, {
        type: "ERROR",
        code: "INTERNAL_ERROR",
        message: "Unexpected WS server error.",
      });
    }
  });

  socket.on("close", (code, reasonBuffer) => {
    const sessionId = removeSocket(socket);
    inc("ws_connections_active", undefined, -1);

    connLog.info(
      {
        code,
        reason: reasonBuffer?.toString() ?? "",
        durationMs: Date.now() - connection.connectedAt,
      },
      "ws_disconnect",
    );

    if (sessionId) {
      broadcast(sessionId, {
        type: "PRESENCE",
        sessionId,
        users: currentPresence(sessionId),
      });
      inc("ws_broadcast_total");
    }
  });
});

startSnapshotWorker();
logger.info(
  {
    wsUrl: `ws://localhost:${WS_PORT}`,
    healthUrl: `http://localhost:${WS_HEALTH_PORT}/health`,
  },
  "ws_server_started",
);
