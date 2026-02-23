import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireSessionAccess } from "@/src/lib/auth/requireRole";
import { handleApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { id } = await context.params;

    const session = await requireSessionAccess(user, id);

    const participants = await prisma.sessionParticipant.findMany({
      where: { sessionId: id },
      select: {
        userId: true,
        roleInSession: true,
        canDraw: true,
        joinedAt: true,
        leftAt: true,
      },
      orderBy: [{ roleInSession: "asc" }, { userId: "asc" }],
    });

    return NextResponse.json({ session, participants });
  } catch (error) {
    return handleApiError(error);
  }
}
