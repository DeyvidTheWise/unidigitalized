import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireSessionReadAccess } from "@/src/lib/auth/requireRole";
import { handleApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { id: sessionId } = await context.params;

    const session = await requireSessionReadAccess(user, sessionId);
    const participantsCount = await prisma.sessionParticipant.count({
      where: {
        sessionId,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      scheduledStartAt: session.scheduledStartAt,
      actualStartAt: session.actualStartAt,
      endedAt: session.endedAt,
      participantsCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
