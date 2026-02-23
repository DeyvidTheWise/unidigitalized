import { NextRequest, NextResponse } from "next/server";
import { ExportKind } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireSessionAccess, requireTutorOrAdmin } from "@/src/lib/auth/requireRole";
import { ApiError, handleApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";
import { buildBoardState } from "@/src/exports/buildBoardState";
import { renderBoardToPng } from "@/src/exports/renderBoardToPng";
import { generatePdfFromPng } from "@/src/exports/generatePdf";
import { exportKeyForId, saveExportPdf, deleteExportPdf } from "@/src/exports/storage";

export const runtime = "nodejs";

function exportTtlHours(): number {
  const raw = Number.parseInt(process.env.EXPORT_TTL_HOURS ?? "24", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireTutorOrAdmin(user);

    const { id: sessionId } = await context.params;
    const session = await requireSessionAccess(user, sessionId);

    if (session.status !== "ENDED") {
      throw new ApiError(409, "SESSION_NOT_ENDED", "Session must be ended before export.");
    }

    const board = await buildBoardState(sessionId);
    const png = renderBoardToPng(board.state);
    const pdfBuffer = await generatePdfFromPng(png.pngBuffer);

    const exportId = crypto.randomUUID();
    const storagePath = exportKeyForId(exportId);

    await saveExportPdf(storagePath, pdfBuffer);

    const expiresAt = new Date(Date.now() + exportTtlHours() * 60 * 60 * 1000);

    try {
      await prisma.export.create({
        data: {
          id: exportId,
          sessionId,
          requestedByUserId: user.id,
          kind: ExportKind.PDF,
          storagePath,
          expiresAt,
        },
      });
    } catch (error) {
      await deleteExportPdf(storagePath).catch(() => undefined);
      throw error;
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "EXPORT_CREATE",
        targetType: "EXPORT",
        targetId: exportId,
        ip: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
        metadata: {
          sessionId,
          lastServerSeq: board.lastServerSeq,
          objectCount: board.objectCount,
        },
      },
    });

    return NextResponse.json({
      exportId,
      expiresAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
