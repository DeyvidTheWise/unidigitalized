import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError } from "@/src/lib/api/errors";
import { deleteExportPdf } from "@/src/exports/storage";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id } = await context.params;

    const exp = await prisma.export.findUnique({
      where: { id },
      select: { id: true, storagePath: true, deletedAt: true },
    });
    if (!exp) {
      return NextResponse.json({ ok: true });
    }

    await deleteExportPdf(exp.storagePath).catch(() => undefined);
    await prisma.export.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
