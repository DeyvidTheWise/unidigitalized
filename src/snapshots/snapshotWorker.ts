import "dotenv/config";
import { prisma } from "../lib/prisma";
import { applyOpShared } from "../whiteboard/shared/applyOp";
import {
  createEmptySceneState,
  sceneFromUnknown,
  sceneToSerializable,
  type SceneState,
} from "../whiteboard/model";

const SNAPSHOT_OP_THRESHOLD = Number.parseInt(process.env.SNAPSHOT_OP_THRESHOLD ?? "300", 10);
const SNAPSHOT_MAX_INTERVAL_SECONDS = Number.parseInt(process.env.SNAPSHOT_MAX_INTERVAL_SECONDS ?? "120", 10);
const SNAPSHOT_WORKER_INTERVAL_SECONDS = Number.parseInt(process.env.SNAPSHOT_WORKER_INTERVAL_SECONDS ?? "30", 10);
const SNAPSHOT_APPLY_BATCH_SIZE = 2000;

const requestedSessions = new Set<string>();
let workerTimer: NodeJS.Timeout | null = null;

function now(): Date {
  return new Date();
}

export function requestSnapshotForSession(sessionId: string): void {
  requestedSessions.add(sessionId);
}

async function shouldSnapshotSession(sessionId: string): Promise<boolean> {
  const latestSnapshot = await prisma.whiteboardSnapshot.findFirst({
    where: { sessionId },
    orderBy: { lastServerSeq: "desc" },
    select: { lastServerSeq: true, createdAt: true },
  });

  const afterSeq = latestSnapshot?.lastServerSeq ?? BigInt(0);

  const latestOp = await prisma.whiteboardOp.findFirst({
    where: {
      sessionId,
      serverSeq: { gt: afterSeq },
    },
    orderBy: { serverSeq: "desc" },
    select: { serverSeq: true },
  });

  if (!latestOp) {
    return false;
  }

  const opsSinceSnapshot = Number(latestOp.serverSeq - afterSeq);
  if (opsSinceSnapshot >= SNAPSHOT_OP_THRESHOLD) {
    return true;
  }

  if (!latestSnapshot) {
    return opsSinceSnapshot > 0;
  }

  const maxIntervalMs = SNAPSHOT_MAX_INTERVAL_SECONDS * 1000;
  return now().getTime() - latestSnapshot.createdAt.getTime() >= maxIntervalMs;
}

export async function buildSnapshotForSession(sessionId: string): Promise<{ created: boolean; lastServerSeq: number }> {
  const latestSnapshot = await prisma.whiteboardSnapshot.findFirst({
    where: { sessionId },
    orderBy: { lastServerSeq: "desc" },
  });

  let state: SceneState = latestSnapshot?.state
    ? sceneFromUnknown(latestSnapshot.state)
    : createEmptySceneState();
  let lastServerSeq = latestSnapshot?.lastServerSeq ?? BigInt(0);
  let appliedAny = false;

  while (true) {
    const ops = await prisma.whiteboardOp.findMany({
      where: {
        sessionId,
        serverSeq: { gt: lastServerSeq },
      },
      orderBy: { serverSeq: "asc" },
      take: SNAPSHOT_APPLY_BATCH_SIZE,
      select: {
        serverSeq: true,
        opType: true,
        payload: true,
      },
    });

    if (ops.length === 0) {
      break;
    }

    for (const op of ops) {
      state = applyOpShared(state, op.opType, op.payload);
      lastServerSeq = op.serverSeq;
      appliedAny = true;
    }
  }

  if (!appliedAny) {
    return { created: false, lastServerSeq: Number(lastServerSeq) };
  }

  state = {
    ...state,
    version: { lastServerSeq: Number(lastServerSeq) },
  };

  await prisma.$transaction(async (tx) => {
    await tx.whiteboardSnapshot.create({
      data: {
        sessionId,
        lastServerSeq,
        state: sceneToSerializable(state),
      },
    });
  });

  return { created: true, lastServerSeq: Number(lastServerSeq) };
}

export async function runSnapshotWorkerOnce(): Promise<{ scanned: number; created: number }> {
  const activeSessions = await prisma.session.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const targetSessions = new Set<string>(activeSessions.map((s) => s.id));
  for (const sessionId of requestedSessions) {
    targetSessions.add(sessionId);
  }
  requestedSessions.clear();

  let created = 0;

  for (const sessionId of targetSessions) {
    const should = await shouldSnapshotSession(sessionId);
    if (!should) {
      continue;
    }

    const result = await buildSnapshotForSession(sessionId);
    if (result.created) {
      created += 1;
    }
  }

  return { scanned: targetSessions.size, created };
}

export function startSnapshotWorker(): void {
  if (workerTimer) {
    return;
  }

  const intervalMs = Math.max(5, SNAPSHOT_WORKER_INTERVAL_SECONDS) * 1000;

  workerTimer = setInterval(() => {
    void runSnapshotWorkerOnce().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("snapshot worker run failed", error);
    });
  }, intervalMs);

  void runSnapshotWorkerOnce().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("snapshot worker initial run failed", error);
  });
}

export function stopSnapshotWorker(): void {
  if (!workerTimer) {
    return;
  }

  clearInterval(workerTimer);
  workerTimer = null;
}
