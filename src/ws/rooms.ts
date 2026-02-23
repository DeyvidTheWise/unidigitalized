import type WebSocket from "ws";
import type { IncomingMessage } from "node:http";
import { prisma } from "../lib/prisma";
import type { ServerMessage } from "./protocol";

export type SocketMeta = {
  userId: string;
  role: "ADMIN" | "TUTOR" | "STUDENT";
  request: IncomingMessage;
  sessionId: string | null;
  lastCursorTs: number;
};

const roomBySessionId = new Map<string, Set<WebSocket>>();
const metaBySocket = new Map<WebSocket, SocketMeta>();

export function attachSocket(socket: WebSocket, meta: SocketMeta): void {
  metaBySocket.set(socket, meta);
}

export function getSocketMeta(socket: WebSocket): SocketMeta | undefined {
  return metaBySocket.get(socket);
}

export function removeSocket(socket: WebSocket): string | null {
  const meta = metaBySocket.get(socket);
  if (!meta) {
    return null;
  }

  if (meta.sessionId) {
    const set = roomBySessionId.get(meta.sessionId);
    if (set) {
      set.delete(socket);
      if (set.size === 0) {
        roomBySessionId.delete(meta.sessionId);
      }
    }
  }

  metaBySocket.delete(socket);
  return meta.sessionId;
}

export function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

export function broadcast(sessionId: string, message: ServerMessage): void {
  const sockets = roomBySessionId.get(sessionId);
  if (!sockets) return;

  for (const ws of sockets) {
    send(ws, message);
  }
}

export function currentPresence(sessionId: string): Array<{ userId: string }> {
  const sockets = roomBySessionId.get(sessionId);
  if (!sockets) return [];

  const users = new Set<string>();
  for (const ws of sockets) {
    const meta = metaBySocket.get(ws);
    if (meta?.sessionId === sessionId) {
      users.add(meta.userId);
    }
  }

  return [...users].map((userId) => ({ userId }));
}

export async function joinSessionRoom(socket: WebSocket, sessionId: string): Promise<{ ok: true } | { ok: false; code: "NOT_PARTICIPANT"; message: string }> {
  const meta = metaBySocket.get(socket);
  if (!meta) {
    return { ok: false, code: "NOT_PARTICIPANT", message: "Socket metadata missing." };
  }

  const participant = await prisma.sessionParticipant.findFirst({
    where: {
      sessionId,
      userId: meta.userId,
      leftAt: null,
    },
    select: { id: true },
  });

  if (!participant && meta.role !== "ADMIN") {
    return { ok: false, code: "NOT_PARTICIPANT", message: "User is not a participant." };
  }

  if (meta.sessionId && meta.sessionId !== sessionId) {
    const oldSet = roomBySessionId.get(meta.sessionId);
    oldSet?.delete(socket);
    if (oldSet && oldSet.size === 0) {
      roomBySessionId.delete(meta.sessionId);
    }
  }

  let room = roomBySessionId.get(sessionId);
  if (!room) {
    room = new Set<WebSocket>();
    roomBySessionId.set(sessionId, room);
  }
  room.add(socket);
  meta.sessionId = sessionId;

  return { ok: true };
}
