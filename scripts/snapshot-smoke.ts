import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { runSnapshotWorkerOnce } from "../src/snapshots/snapshotWorker";
import { loadJoinState } from "../src/ws/stateLoad";
import { ingestOp } from "../src/ws/opIngest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function createTempTutor() {
  const email = `snapshot-tutor-${Date.now()}-${Math.floor(Math.random() * 10_000)}@test.local`;
  const password = "Password123!";
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "TUTOR",
    },
    select: { id: true },
  });
  return user;
}

async function main() {
  const tutor = await createTempTutor();

  const session = await prisma.session.create({
    data: {
      title: `Snapshot Smoke ${Date.now()}`,
      scheduledStartAt: new Date(Date.now() + 60_000),
      actualStartAt: new Date(),
      status: "ACTIVE",
      createdByUserId: tutor.id,
    },
    select: { id: true },
  });

  await prisma.sessionParticipant.create({
    data: {
      sessionId: session.id,
      userId: tutor.id,
      roleInSession: "TUTOR",
      canDraw: true,
      joinedAt: new Date(),
    },
  });

  await prisma.sessionSequence.upsert({
    where: { sessionId: session.id },
    update: { nextSeq: BigInt(351) },
    create: { sessionId: session.id, nextSeq: BigInt(351) },
  });

  const now = Date.now();
  for (let i = 1; i <= 350; i += 1) {
    await prisma.whiteboardOp.create({
      data: {
        sessionId: session.id,
        serverSeq: BigInt(i),
        actorUserId: tutor.id,
        clientOpId: `snapshot-smoke-${i}`,
        opType: "TEXT_ADD",
        payload: {
          textObj: {
            objectType: "text",
            id: `txt-${i}`,
            x: i,
            y: i,
            text: `hello-${i}`,
            fontSize: 14,
            color: "#111827",
            createdBy: tutor.id,
          },
        },
        createdAt: new Date(now + i),
      },
    });
  }

  const workerResult = await runSnapshotWorkerOnce();
  assert(workerResult.created >= 1, "Expected at least one snapshot to be created");

  const latestSnapshot = await prisma.whiteboardSnapshot.findFirst({
    where: { sessionId: session.id },
    orderBy: { lastServerSeq: "desc" },
  });

  assert(latestSnapshot, "Expected snapshot row to exist");
  assert(Number(latestSnapshot.lastServerSeq) >= 350, "Expected snapshot seq >= 350");

  const joinState = await loadJoinState(session.id);
  assert(joinState.snapshot, "Expected join state snapshot");
  assert(joinState.opsAfterSnapshot.length <= 5, "Expected small replay set after snapshot");

  await prisma.session.update({
    where: { id: session.id },
    data: {
      status: "ENDED",
      endedAt: new Date(),
    },
  });

  const preCount = await prisma.whiteboardOp.count({ where: { sessionId: session.id } });

  const reject = await ingestOp({
    sessionId: session.id,
    actorUserId: tutor.id,
    actorRole: "TUTOR",
    clientOpId: randomUUID(),
    opType: "TEXT_ADD",
    payload: {
      textObj: {
        objectType: "text",
        id: randomUUID(),
        x: 0,
        y: 0,
        text: "blocked",
        fontSize: 12,
        color: "#111827",
        createdBy: tutor.id,
      },
    },
    ip: null,
    userAgent: "snapshot-smoke",
  });

  assert(!reject.accepted, "Expected rejected op for ENDED session");
  assert(reject.code === "SESSION_ENDED", `Expected SESSION_ENDED, got ${reject.code}`);

  const postCount = await prisma.whiteboardOp.count({ where: { sessionId: session.id } });
  assert(preCount === postCount, "Expected no new ops inserted for ENDED session");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId: session.id,
        snapshotSeq: Number(latestSnapshot.lastServerSeq),
        joinOpsAfterSnapshot: joinState.opsAfterSnapshot.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
