import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requestSnapshotForSession } from "../snapshots/snapshotWorker";
import type { WsRejectCode } from "./protocol";

const SNAPSHOT_OP_THRESHOLD = Number.parseInt(process.env.SNAPSHOT_OP_THRESHOLD ?? "300", 10);

type IngestInput = {
  sessionId: string;
  actorUserId: string;
  actorRole: "ADMIN" | "TUTOR" | "STUDENT";
  clientOpId: string;
  opType: string;
  payload: Prisma.InputJsonValue;
  ip: string | null;
  userAgent: string | null;
};

export type IngestResult =
  | {
      accepted: true;
      serverSeq: number;
      createdAt: string;
      existing: boolean;
      actorUserId: string;
      opType: string;
      payload: Prisma.JsonValue;
    }
  | {
      accepted: false;
      code: WsRejectCode;
      message: string;
    };

async function auditReject(
  input: IngestInput,
  code: WsRejectCode,
  message: string,
  action = "WS_OP_REJECT",
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action,
      targetType: "SESSION",
      targetId: input.sessionId,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: {
        code,
        message,
        clientOpId: input.clientOpId,
        opType: input.opType,
      },
    },
  });
}

export async function ingestOp(input: IngestInput): Promise<IngestResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: input.sessionId },
        select: { id: true, status: true },
      });

      if (!session) {
        return { accepted: false as const, code: "VALIDATION_ERROR" as const, message: "Session not found." };
      }

      if (session.status === "ENDED") {
        return { accepted: false as const, code: "SESSION_ENDED" as const, message: "Session has ended." };
      }

      if (session.status !== "ACTIVE") {
        return { accepted: false as const, code: "SESSION_NOT_ACTIVE" as const, message: "Session is not active." };
      }

      const participant = await tx.sessionParticipant.findUnique({
        where: {
          sessionId_userId: {
            sessionId: input.sessionId,
            userId: input.actorUserId,
          },
        },
        select: {
          roleInSession: true,
          canDraw: true,
          leftAt: true,
        },
      });

      if (!participant || participant.leftAt) {
        return {
          accepted: false as const,
          code: "NOT_PARTICIPANT" as const,
          message: "User is not an active participant.",
        };
      }

      const canSubmit =
        input.actorRole === "ADMIN" || participant.roleInSession === "TUTOR" || participant.canDraw;

      if (!canSubmit) {
        return { accepted: false as const, code: "DRAW_NOT_ALLOWED" as const, message: "Drawing is not allowed." };
      }

      const existing = await tx.whiteboardOp.findUnique({
        where: {
          sessionId_actorUserId_clientOpId: {
            sessionId: input.sessionId,
            actorUserId: input.actorUserId,
            clientOpId: input.clientOpId,
          },
        },
      });

      if (existing) {
        return {
          accepted: true as const,
          serverSeq: Number(existing.serverSeq),
          createdAt: existing.createdAt.toISOString(),
          existing: true,
          actorUserId: existing.actorUserId,
          opType: existing.opType,
          payload: existing.payload,
        };
      }

      await tx.$executeRaw`
        INSERT INTO "SessionSequence" ("sessionId", "nextSeq")
        VALUES (${input.sessionId}::uuid, 1)
        ON CONFLICT ("sessionId") DO NOTHING
      `;

      const seqRows = await tx.$queryRaw<Array<{ nextSeq: bigint }>>`
        SELECT "nextSeq"
        FROM "SessionSequence"
        WHERE "sessionId" = ${input.sessionId}::uuid
        FOR UPDATE
      `;

      if (seqRows.length !== 1) {
        return { accepted: false as const, code: "INTERNAL_ERROR" as const, message: "Sequence row unavailable." };
      }

      const nextSeq = seqRows[0].nextSeq;

      await tx.$executeRaw`
        UPDATE "SessionSequence"
        SET "nextSeq" = "nextSeq" + 1
        WHERE "sessionId" = ${input.sessionId}::uuid
      `;

      const created = await tx.whiteboardOp.create({
        data: {
          sessionId: input.sessionId,
          serverSeq: nextSeq,
          actorUserId: input.actorUserId,
          clientOpId: input.clientOpId,
          opType: input.opType,
          payload: input.payload,
        },
      });

      return {
        accepted: true as const,
        serverSeq: Number(created.serverSeq),
        createdAt: created.createdAt.toISOString(),
        existing: false,
        actorUserId: created.actorUserId,
        opType: created.opType,
        payload: created.payload,
      };
    });

    if (!result.accepted) {
      if (result.code === "SESSION_NOT_ACTIVE" || result.code === "SESSION_ENDED") {
        await auditReject(input, result.code, result.message, "WS_OP_REJECT_STATE");
      } else if (result.code === "NOT_PARTICIPANT" || result.code === "DRAW_NOT_ALLOWED") {
        await auditReject(input, result.code, result.message);
      }
      return result;
    }

    if (!result.existing && result.serverSeq % SNAPSHOT_OP_THRESHOLD === 0) {
      requestSnapshotForSession(input.sessionId);
    }

    return result;
  } catch {
    return {
      accepted: false,
      code: "INTERNAL_ERROR",
      message: "Failed to process operation.",
    };
  }
}
