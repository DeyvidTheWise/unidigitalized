import { applyOpShared } from "../whiteboard/shared/applyOp";
import { createEmptySceneState, sceneFromUnknown, type SceneState } from "../whiteboard/model";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/api/errors";

const EXPORT_MAX_OPS_WITHOUT_SNAPSHOT = 20_000;

export async function buildBoardState(sessionId: string): Promise<{
  state: SceneState;
  lastServerSeq: number;
  objectCount: number;
  replayOpsCount: number;
}> {
  // Index path:
  // - WhiteboardSnapshot(sessionId, lastServerSeq DESC) to seed export from latest checkpoint.
  // - WhiteboardOp(sessionId, serverSeq) to replay only trailing operations in order.
  const latestSnapshot = await prisma.whiteboardSnapshot.findFirst({
    where: { sessionId },
    orderBy: { lastServerSeq: "desc" },
  });

  const baseSeq = latestSnapshot?.lastServerSeq ?? BigInt(0);

  if (!latestSnapshot) {
    const totalOps = await prisma.whiteboardOp.count({ where: { sessionId } });
    if (totalOps > EXPORT_MAX_OPS_WITHOUT_SNAPSHOT) {
      throw new ApiError(409, "NEED_SNAPSHOT", "Board history too large without snapshot.");
    }
  }

  const ops = await prisma.whiteboardOp.findMany({
    where: {
      sessionId,
      serverSeq: { gt: baseSeq },
    },
    orderBy: { serverSeq: "asc" },
    select: {
      serverSeq: true,
      opType: true,
      payload: true,
    },
  });

  let state = latestSnapshot?.state
    ? sceneFromUnknown(latestSnapshot.state)
    : createEmptySceneState();

  let lastServerSeq = Number(baseSeq);

  for (const op of ops) {
    state = applyOpShared(state, op.opType, op.payload);
    lastServerSeq = Number(op.serverSeq);
  }

  state = {
    ...state,
    version: { lastServerSeq },
  };

  return {
    state,
    lastServerSeq,
    objectCount: state.objectsById.size,
    replayOpsCount: ops.length,
  };
}
