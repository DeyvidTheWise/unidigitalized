import { z } from "zod";

export const clientHelloSchema = z.object({
  type: z.literal("HELLO"),
  sessionId: z.string().uuid(),
});

export const clientOpSubmitSchema = z.object({
  type: z.literal("OP_SUBMIT"),
  sessionId: z.string().uuid(),
  clientOpId: z.string().min(1).max(200),
  opType: z.string().min(1).max(100),
  payload: z.unknown(),
});

export const clientCursorSchema = z.object({
  type: z.literal("CURSOR"),
  sessionId: z.string().uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const clientPingSchema = z.object({
  type: z.literal("PING"),
});

const clientMessageSchema = z.discriminatedUnion("type", [
  clientHelloSchema,
  clientOpSubmitSchema,
  clientCursorSchema,
  clientPingSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type WsRejectCode =
  | "NOT_AUTHENTICATED"
  | "NOT_PARTICIPANT"
  | "SESSION_NOT_ACTIVE"
  | "SESSION_ENDED"
  | "DRAW_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export type ServerMessage =
  | {
      type: "WELCOME";
      userId: string;
      sessionId: string;
      presence: Array<{ userId: string }>;
      lastServerSeq: number;
      stateSnapshot: unknown | null;
      ops: Array<{
        serverSeq: number;
        actorUserId: string;
        opType: string;
        payload: unknown;
        createdAt: string;
      }>;
      truncated: boolean;
    }
  | { type: "OP_ACCEPTED"; clientOpId: string; serverSeq: number }
  | { type: "OP_REJECTED"; clientOpId: string; code: WsRejectCode; message: string }
  | {
      type: "OP_BROADCAST";
      serverSeq: number;
      actorUserId: string;
      opType: string;
      payload: unknown;
      createdAt: string;
    }
  | { type: "PRESENCE"; sessionId: string; users: Array<{ userId: string }> }
  | { type: "CURSOR_BROADCAST"; sessionId: string; userId: string; x: number; y: number }
  | { type: "PONG" }
  | { type: "ERROR"; code: "VALIDATION_ERROR" | "INTERNAL_ERROR"; message: string };

export function parseClientMessage(raw: string): { ok: true; message: ClientMessage } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }

  const result = clientMessageSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: "Invalid message format" };
  }

  return { ok: true, message: result.data };
}
