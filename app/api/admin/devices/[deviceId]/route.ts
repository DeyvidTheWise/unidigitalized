import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError } from "@/src/lib/api/errors";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { deviceId } = await context.params;
    const body = await request.json();
    const revoke = Boolean(body?.revoke);

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: revoke
        ? { revokedAt: new Date(), verifiedAt: null }
        : { revokedAt: null, verifiedAt: new Date() },
      select: { id: true, userId: true, verifiedAt: true, revokedAt: true },
    });

    return NextResponse.json({ device: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { deviceId } = await context.params;

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { deviceId } });
      await tx.device.delete({ where: { id: deviceId } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
