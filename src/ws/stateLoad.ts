import { prisma } from "../lib/prisma";
import { requestSnapshotForSession } from "../snapshots/snapshotWorker";

const MAX_JOIN_OPS = Number.parseInt(process.env.MAX_JOIN_OPS ?? "5000", 10);
const SNAPSHOT_TRIGGER_THRESHOLD = Number.parseInt(process.env.SNAPSHOT_OP_THRESHOLD ?? "300", 10);

export type JoinSnapshotPayload = {
  lastServerSeq: number;
  state: unknown;
};

export async function loadJoinState(sessionId: string): Promise<{
  snapshot: JoinSnapshotPayload | null;
  opsAfterSnapshot: Array<{
    serverSeq: number;
    actorUserId: string;
    opType: string;
    payload: unknown;
    createdAt: string;
  }>;
  lastServerSeqFinal: number;
  needsResync: boolean;
}> {
  // Index path:
  // - WhiteboardSnapshot(sessionId, lastServerSeq DESC) for latest snapshot lookup.
  // - WhiteboardOp(sessionId, serverSeq) for ordered replay after snapshot.
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
    take: MAX_JOIN_OPS + 1,
  });

  const overLimit = ops.length > MAX_JOIN_OPS;

  if (overLimit) {
    requestSnapshotForSession(sessionId);

    const finalSeq = Number(ops[ops.length - 1]?.serverSeq ?? latestSnapshot?.lastServerSeq ?? BigInt(0));
    return {
      snapshot: latestSnapshot
        ? {
            lastServerSeq: Number(latestSnapshot.lastServerSeq),
            state: latestSnapshot.state,
          }
        : null,
      opsAfterSnapshot: [],
      lastServerSeqFinal: finalSeq,
      needsResync: true,
    };
  }

  if (!latestSnapshot && ops.length >= SNAPSHOT_TRIGGER_THRESHOLD) {
    requestSnapshotForSession(sessionId);
  }

  const finalSeq = ops.length
    ? Number(ops[ops.length - 1].serverSeq)
    : Number(latestSnapshot?.lastServerSeq ?? BigInt(0));

  return {
    snapshot: latestSnapshot
      ? {
          lastServerSeq: Number(latestSnapshot.lastServerSeq),
          state: latestSnapshot.state,
        }
      : null,
    opsAfterSnapshot: ops.map((op) => ({
      serverSeq: Number(op.serverSeq),
      actorUserId: op.actorUserId,
      opType: op.opType,
      payload: op.payload,
      createdAt: op.createdAt.toISOString(),
    })),
    lastServerSeqFinal: finalSeq,
    needsResync: false,
  };
}
