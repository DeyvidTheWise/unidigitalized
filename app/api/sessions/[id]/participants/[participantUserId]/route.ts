import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import {
  assertSessionNotEnded,
  requireSessionAccess,
  requireTutorOrAdmin,
} from "@/src/lib/auth/requireRole";
import { ApiError, handleApiError, jsonApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; participantUserId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireTutorOrAdmin(user);

    const { id: sessionId, participantUserId } = await context.params;
    const session = await requireSessionAccess(user, sessionId);
    assertSessionNotEnded(session);

    const body = await request.json();
    if (typeof body?.canDraw !== "boolean") {
      return jsonApiError(400, "VALIDATION_ERROR", "canDraw must be a boolean.");
    }

    const existing = await prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: participantUserId,
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Participant not found.");
    }

    const participant = await prisma.sessionParticipant.update({
      where: {
        sessionId_userId: {
          sessionId,
          userId: participantUserId,
        },
      },
      data: {
        canDraw: body.canDraw,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "SESSION_PARTICIPANT_UPDATE",
        targetType: "SESSION",
        targetId: sessionId,
        ip: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        metadata: {
          participantUserId,
          canDraw: body.canDraw,
        },
      },
    });

    return NextResponse.json({ participant });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; participantUserId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireTutorOrAdmin(user);

    const { id: sessionId, participantUserId } = await context.params;
    const session = await requireSessionAccess(user, sessionId);
    assertSessionNotEnded(session);

    if (participantUserId === session.createdByUserId) {
      throw new ApiError(403, "FORBIDDEN", "Cannot remove the session creator.");
    }

    const existing = await prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: participantUserId,
        },
      },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Participant not found.");
    }

    await prisma.sessionParticipant.update({
      where: {
        sessionId_userId: {
          sessionId,
          userId: participantUserId,
        },
      },
      data: {
        leftAt: new Date(),
        canDraw: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "SESSION_PARTICIPANT_REMOVE",
        targetType: "SESSION",
        targetId: sessionId,
        ip: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        metadata: {
          participantUserId,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
