import { prisma } from "../lib/prisma";

const JOIN_OP_LIMIT = 5000;

export async function loadJoinState(sessionId: string): Promise<{
  lastServerSeq: number;
  stateSnapshot: unknown | null;
  ops: Array<{
    serverSeq: number;
    actorUserId: string;
    opType: string;
    payload: unknown;
    createdAt: string;
  }>;
  truncated: boolean;
}> {
  const latestSnapshot = await prisma.whiteboardSnapshot.findFirst({
    where: { sessionId },
    orderBy: { lastServerSeq: "desc" },
  });

  const afterSeq = latestSnapshot?.lastServerSeq ?? BigInt(0);

  const ops = await prisma.whiteboardOp.findMany({
    where: {
      sessionId,
      serverSeq: { gt: afterSeq },
    },
    orderBy: { serverSeq: "asc" },
    take: JOIN_OP_LIMIT + 1,
  });

  const truncated = ops.length > JOIN_OP_LIMIT;
  const limitedOps = truncated ? ops.slice(0, JOIN_OP_LIMIT) : ops;

  const highestSeq = limitedOps.length
    ? limitedOps[limitedOps.length - 1].serverSeq
    : latestSnapshot?.lastServerSeq ?? BigInt(0);

  return {
    lastServerSeq: Number(highestSeq),
    stateSnapshot: latestSnapshot?.state ?? null,
    ops: limitedOps.map((op) => ({
      serverSeq: Number(op.serverSeq),
      actorUserId: op.actorUserId,
      opType: op.opType,
      payload: op.payload,
      createdAt: op.createdAt.toISOString(),
    })),
    truncated,
  };
}
