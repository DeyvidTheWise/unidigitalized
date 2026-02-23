import { NextRequest, NextResponse } from "next/server";
import { readExportPdf } from "@/src/exports/storage";
import { ApiError, handleApiError } from "@/src/lib/api/errors";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireSessionAccess, requireTutorOrAdmin } from "@/src/lib/auth/requireRole";
import { prisma } from "@/src/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireTutorOrAdmin(user);

    const { exportId } = await context.params;

    const record = await prisma.export.findUnique({
      where: { id: exportId },
      select: {
        id: true,
        sessionId: true,
        storagePath: true,
        expiresAt: true,
        deletedAt: true,
      },
    });

    if (!record || record.deletedAt) {
      throw new ApiError(404, "NOT_FOUND", "Export not found.");
    }

    await requireSessionAccess(user, record.sessionId);

    if (record.expiresAt <= new Date()) {
      await prisma.export.update({
        where: { id: record.id },
        data: { deletedAt: new Date() },
      });
      throw new ApiError(410, "EXPORT_EXPIRED", "Export has expired.");
    }

    let file: Buffer;
    try {
      file = await readExportPdf(record.storagePath);
    } catch {
      throw new ApiError(404, "NOT_FOUND", "Export file not found.");
    }

    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"session-${record.sessionId}.pdf\"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
