import { prisma } from "../prisma";
import { deleteExportPdf } from "@/src/exports/storage";

export async function deleteSessionCascade(sessionId: string): Promise<void> {
  const exports = await prisma.export.findMany({
    where: { sessionId },
    select: { id: true, storagePath: true },
  });

  for (const exp of exports) {
    await deleteExportPdf(exp.storagePath).catch(() => undefined);
  }

  await prisma.$transaction(async (tx) => {
    await tx.export.deleteMany({ where: { sessionId } });
    await tx.whiteboardSnapshot.deleteMany({ where: { sessionId } });
    await tx.whiteboardOp.deleteMany({ where: { sessionId } });
    await tx.sessionParticipant.deleteMany({ where: { sessionId } });
    await tx.sessionSequence.deleteMany({ where: { sessionId } });
    await tx.session.delete({ where: { id: sessionId } });
  });
}

export async function deleteUserCascade(userId: string): Promise<void> {
  const createdSessionIds = await prisma.session.findMany({
    where: { createdByUserId: userId },
    select: { id: true },
  });

  for (const session of createdSessionIds) {
    await deleteSessionCascade(session.id);
  }

  const exportsByRequester = await prisma.export.findMany({
    where: { requestedByUserId: userId },
    select: { storagePath: true },
  });
  for (const exp of exportsByRequester) {
    await deleteExportPdf(exp.storagePath).catch(() => undefined);
  }

  await prisma.$transaction(async (tx) => {
    await tx.export.deleteMany({ where: { requestedByUserId: userId } });
    await tx.whiteboardOp.deleteMany({ where: { actorUserId: userId } });
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.device.deleteMany({ where: { userId } });
    await tx.sessionParticipant.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
}
