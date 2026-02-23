import { NextRequest, NextResponse } from "next/server";
import { SessionParticipantRole } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError, jsonApiError } from "@/src/lib/api/errors";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id: sessionId } = await context.params;
    const body = await request.json();
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const roleInSession = body?.roleInSession as SessionParticipantRole | undefined;

    if (!userId) {
      return jsonApiError(400, "VALIDATION_ERROR", "userId is required.");
    }

    const participant = await prisma.sessionParticipant.create({
      data: {
        sessionId,
        userId,
        roleInSession: roleInSession && Object.values(SessionParticipantRole).includes(roleInSession) ? roleInSession : "STUDENT",
        canDraw: roleInSession === "TUTOR",
      },
    });

    return NextResponse.json({ participant });
  } catch (error) {
    return handleApiError(error);
  }
}
