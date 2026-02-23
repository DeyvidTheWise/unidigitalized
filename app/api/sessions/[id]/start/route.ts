import { NextRequest, NextResponse } from "next/server";
import { SessionStatus } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import {
  assertSessionNotEnded,
  requireSessionAccess,
  requireTutorOrAdmin,
} from "@/src/lib/auth/requireRole";
import { ApiError, handleApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireTutorOrAdmin(user);

    const { id: sessionId } = await context.params;
    const session = await requireSessionAccess(user, sessionId);

    if (session.status === "ENDED") {
      assertSessionNotEnded(session);
    }

    const transitioned = await prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: {
          id: sessionId,
          status: SessionStatus.SCHEDULED,
        },
        data: {
          status: SessionStatus.ACTIVE,
          actualStartAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        const current = await tx.session.findUnique({
          where: { id: sessionId },
          select: { status: true },
        });

        if (!current) {
          throw new ApiError(404, "NOT_FOUND", "Session not found.");
        }

        if (current.status === SessionStatus.ENDED) {
          throw new ApiError(409, "SESSION_ENDED", "Session is ended and immutable.");
        }

        throw new ApiError(409, "INVALID_STATE_TRANSITION", "Session can only start from SCHEDULED.");
      }

      const finalSession = await tx.session.findUnique({
        where: { id: sessionId },
      });

      if (!finalSession) {
        throw new ApiError(404, "NOT_FOUND", "Session not found.");
      }

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "SESSION_START",
          targetType: "SESSION",
          targetId: sessionId,
          ip: request.headers.get("x-forwarded-for") ?? null,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      });

      return finalSession;
    });

    return NextResponse.json({ session: transitioned });
  } catch (error) {
    return handleApiError(error);
  }
}
