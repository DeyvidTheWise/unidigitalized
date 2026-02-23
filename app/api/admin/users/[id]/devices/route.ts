import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError } from "@/src/lib/api/errors";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id } = await context.params;

    const devices = await prisma.device.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        label: true,
        verifiedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ devices });
  } catch (error) {
    return handleApiError(error);
  }
}
