import { prisma } from "../lib/prisma";
import { deleteExportPdf } from "./storage";

export async function runExportCleanupOnce(): Promise<{ scanned: number; deleted: number }> {
  const expired = await prisma.export.findMany({
    where: {
      deletedAt: null,
      expiresAt: { lte: new Date() },
    },
    select: {
      id: true,
      storagePath: true,
      requestedByUserId: true,
    },
    orderBy: { expiresAt: "asc" },
  });

  let deleted = 0;

  for (const record of expired) {
    try {
      await deleteExportPdf(record.storagePath);
    } catch {
      // ignore file delete errors to keep cleanup resilient
    }

    await prisma.export.update({
      where: { id: record.id },
      data: { deletedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: record.requestedByUserId,
        action: "EXPORT_DELETE_EXPIRED",
        targetType: "EXPORT",
        targetId: record.id,
      },
    });

    deleted += 1;
  }

  return {
    scanned: expired.length,
    deleted,
  };
}
