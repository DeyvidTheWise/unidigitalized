import { SessionStatus, type UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "../api/errors";

type AuthedUser = {
  id: string;
  role: UserRole;
};

export function requireTutorOrAdmin(user: AuthedUser): void {
  if (user.role !== "TUTOR" && user.role !== "ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Tutor or admin role required.");
  }
}

export async function requireSessionAccess(user: AuthedUser, sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledStartAt: true,
      actualStartAt: true,
      endedAt: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!session) {
    throw new ApiError(404, "NOT_FOUND", "Session not found.");
  }

  if (user.role === "ADMIN") {
    return session;
  }

  if (user.role === "TUTOR") {
    if (session.createdByUserId === user.id) {
      return session;
    }

    const asTutorParticipant = await prisma.sessionParticipant.findFirst({
      where: {
        sessionId,
        userId: user.id,
        roleInSession: "TUTOR",
        leftAt: null,
      },
      select: { id: true },
    });

    if (asTutorParticipant) {
      return session;
    }

    throw new ApiError(403, "FORBIDDEN", "No access to this session.");
  }

  const asStudentParticipant = await prisma.sessionParticipant.findFirst({
    where: {
      sessionId,
      userId: user.id,
      leftAt: null,
    },
    select: { id: true },
  });

  if (!asStudentParticipant) {
    throw new ApiError(403, "FORBIDDEN", "No access to this session.");
  }

  return session;
}

export function assertSessionNotEnded(session: { status: SessionStatus }): void {
  if (session.status === "ENDED") {
    throw new ApiError(409, "SESSION_ENDED", "Session is ended and immutable.");
  }
}
