import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireSessionAccess, requireTutorOrAdmin } from "@/src/lib/auth/requireRole";
import { handleApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireTutorOrAdmin(user);

    const { id: sessionId } = await context.params;
    await requireSessionAccess(user, sessionId);

    // Index path: Export(sessionId, createdAt) for ordered export listing by session.
    const exportsList = await prisma.export.findMany({
      where: {
        sessionId,
        deletedAt: null,
      },
      select: {
        id: true,
        kind: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ exports: exportsList });
  } catch (error) {
    return handleApiError(error);
  }
}
