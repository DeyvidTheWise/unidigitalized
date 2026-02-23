import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import {
  assertSessionNotEnded,
  requireSessionAccess,
  requireTutorOrAdmin,
} from "@/src/lib/auth/requireRole";
import { ApiError, handleApiError, jsonApiError } from "@/src/lib/api/errors";
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
    assertSessionNotEnded(session);

    const body = await request.json();
    const participantUserId = typeof body?.userId === "string" ? body.userId : "";
    if (!participantUserId) {
      return jsonApiError(400, "VALIDATION_ERROR", "userId is required.");
    }

    const requestedRole = body?.roleInSession === "TUTOR" ? "TUTOR" : "STUDENT";
    if (requestedRole === "TUTOR" && user.role !== "ADMIN") {
      throw new ApiError(403, "FORBIDDEN", "Only admin can add tutor participants.");
    }

    const participantUser = await prisma.user.findUnique({
      where: { id: participantUserId },
      select: { id: true },
    });

    if (!participantUser) {
      throw new ApiError(404, "NOT_FOUND", "Participant user not found.");
    }

    const participant = await prisma.sessionParticipant.create({
      data: {
        sessionId,
        userId: participantUserId,
        roleInSession: requestedRole,
        canDraw: requestedRole === "TUTOR",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "SESSION_PARTICIPANT_ADD",
        targetType: "SESSION",
        targetId: sessionId,
        ip: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        metadata: {
          participantUserId,
          roleInSession: requestedRole,
        },
      },
    });

    return NextResponse.json({ participant });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonApiError(409, "ALREADY_PARTICIPANT", "User is already a participant.");
    }
    return handleApiError(error);
  }
}
