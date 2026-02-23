import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError } from "@/src/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);

    const sessionId = request.nextUrl.searchParams.get("sessionId") ?? undefined;
    const requestedByUserId = request.nextUrl.searchParams.get("requestedByUserId") ?? undefined;
    const exports = await prisma.export.findMany({
      where: {
        ...(sessionId ? { sessionId } : {}),
        ...(requestedByUserId ? { requestedByUserId } : {}),
      },
      select: {
        id: true,
        sessionId: true,
        requestedByUserId: true,
        kind: true,
        createdAt: true,
        expiresAt: true,
        deletedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    return NextResponse.json({ exports });
  } catch (error) {
    return handleApiError(error);
  }
}
