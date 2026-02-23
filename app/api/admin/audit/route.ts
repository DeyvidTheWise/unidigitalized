import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError } from "@/src/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);

    const targetType = request.nextUrl.searchParams.get("targetType") ?? undefined;
    const targetId = request.nextUrl.searchParams.get("targetId") ?? undefined;
    const limit = Math.min(Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100, 500);

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
