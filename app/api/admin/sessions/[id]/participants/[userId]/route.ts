import { NextRequest, NextResponse } from "next/server";
import { SessionParticipantRole } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError } from "@/src/lib/api/errors";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id: sessionId, userId } = await context.params;
    const body = await request.json();

    const roleInSession = body?.roleInSession as SessionParticipantRole | undefined;
    const leftAt = typeof body?.leftAt === "string" ? new Date(body.leftAt) : body?.leftAt === null ? null : undefined;
    const canDraw = typeof body?.canDraw === "boolean" ? body.canDraw : undefined;

    const participant = await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: {
        ...(roleInSession && Object.values(SessionParticipantRole).includes(roleInSession) ? { roleInSession } : {}),
        ...(typeof canDraw === "boolean" ? { canDraw } : {}),
        ...(leftAt !== undefined ? { leftAt } : {}),
      },
    });

    return NextResponse.json({ participant });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id: sessionId, userId } = await context.params;
    await prisma.sessionParticipant.delete({
      where: { sessionId_userId: { sessionId, userId } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
