import "dotenv/config";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { computeDeviceFingerprint } from "../src/lib/auth/device";
import { hashPassword } from "../src/lib/auth/password";
import { loginUser } from "../src/lib/auth/service";

const WS_URL = process.env.WS_URL ?? "ws://localhost:3001";

type WsJson = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeLoginRequest(deviceId: string, userAgent: string): NextRequest {
  const headers = new Headers();
  headers.set("user-agent", userAgent);
  headers.set("accept-language", "en-US");
  headers.set("cookie", `device_id=${deviceId}`);

  return new NextRequest(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers,
    }),
  );
}

async function createTempUser(role: "TUTOR" | "STUDENT", prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@test.local`;
  const password = "Password123!";
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role,
    },
    select: { id: true, email: true },
  });

  return { ...user, password };
}

async function loginForWs(email: string, password: string, deviceId: string, userAgent: string) {
  const request = makeLoginRequest(deviceId, userAgent);
  return loginUser({
    email,
    password,
    fingerprintHash: computeDeviceFingerprint(request),
    request,
    deviceLabel: `WS Smoke ${userAgent}`,
  });
}

async function ensureActiveSessionForTutor(tutorUserId: string, studentUserId: string): Promise<string> {
  const session = await prisma.session.create({
    data: {
      title: `WS Smoke Session ${Date.now()}`,
      scheduledStartAt: new Date(Date.now() + 60_000),
      actualStartAt: new Date(),
      status: "ACTIVE",
      createdByUserId: tutorUserId,
      participants: {
        create: [
          {
            userId: tutorUserId,
            roleInSession: "TUTOR",
            canDraw: true,
            joinedAt: new Date(),
          },
          {
            userId: studentUserId,
            roleInSession: "STUDENT",
            canDraw: false,
          },
        ],
      },
    },
    select: { id: true },
  });

  await prisma.sessionSequence.upsert({
    where: { sessionId: session.id },
    update: {},
    create: {
      sessionId: session.id,
      nextSeq: BigInt(1),
    },
  });

  return session.id;
}

async function waitForOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === ws.OPEN) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WS open timeout")), 5_000);
    ws.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once("error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function waitForMessage(
  ws: WebSocket,
  predicate: (msg: WsJson) => boolean,
  timeoutMs = 8_000,
): Promise<WsJson> {
  return new Promise<WsJson>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("WS message timeout"));
    }, timeoutMs);

    const onMessage = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as WsJson;
      if (predicate(msg)) {
        clearTimeout(timeout);
        ws.off("message", onMessage);
        resolve(msg);
      }
    };

    ws.on("message", onMessage);
  });
}

function wsWithCookie(cookie: string): WebSocket {
  return new WebSocket(WS_URL, {
    headers: { Cookie: cookie },
  });
}

async function testUnauthenticatedRejected() {
  await new Promise<void>((resolve, reject) => {
    const ws = wsWithCookie("device_id=anon-device");
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("Expected unauthenticated close"));
    }, 5_000);

    ws.on("close", (code: number) => {
      clearTimeout(timeout);
      assert(code === 4401, `Expected 4401 for unauthenticated close, got ${code}`);
      resolve();
    });

    ws.on("error", () => {
      // close event carries the assertion
    });
  });
}

async function main() {
  await testUnauthenticatedRejected();

  const tutor = await createTempUser("TUTOR", "ws-tutor");
  const participantStudent = await createTempUser("STUDENT", "ws-student-participant");
  const outsiderStudent = await createTempUser("STUDENT", "ws-student-outsider");

  const tutorDeviceId = `ws-smoke-tutor-${Date.now()}`;
  const outsiderDeviceId = `ws-smoke-outsider-${Date.now()}`;

  const tutorLogin = await loginForWs(tutor.email, tutor.password, tutorDeviceId, "WsSmokeTutor/1.0");
  const outsiderLogin = await loginForWs(
    outsiderStudent.email,
    outsiderStudent.password,
    outsiderDeviceId,
    "WsSmokeOutsider/1.0",
  );

  const sessionId = await ensureActiveSessionForTutor(tutor.id, participantStudent.id);

  const tutorWs = wsWithCookie(`device_id=${tutorDeviceId}; access_token=${tutorLogin.accessToken}`);
  await waitForOpen(tutorWs);
  tutorWs.send(JSON.stringify({ type: "HELLO", sessionId }));
  const welcome = await waitForMessage(tutorWs, (msg) => msg.type === "WELCOME");
  assert(welcome.sessionId === sessionId, "Expected WELCOME for target session");

  const outsiderWs = wsWithCookie(`device_id=${outsiderDeviceId}; access_token=${outsiderLogin.accessToken}`);
  await waitForOpen(outsiderWs);
  outsiderWs.send(JSON.stringify({ type: "HELLO", sessionId }));
  const outsiderError = await waitForMessage(outsiderWs, (msg) => msg.type === "ERROR");
  assert(
    typeof outsiderError.message === "string" && outsiderError.message.includes("participant"),
    "Expected outsider HELLO rejection",
  );
  outsiderWs.close();

  const clientOpId = randomUUID();
  tutorWs.send(
    JSON.stringify({
      type: "OP_SUBMIT",
      sessionId,
      clientOpId,
      opType: "OBJECT_ADD",
      payload: { objectId: "smoke-1", kind: "rect" },
    }),
  );

  const accepted = await waitForMessage(
    tutorWs,
    (msg) => msg.type === "OP_ACCEPTED" && msg.clientOpId === clientOpId,
  );
  const acceptedSeq = accepted.serverSeq as number;
  assert(typeof acceptedSeq === "number" && acceptedSeq > 0, "Expected OP_ACCEPTED with serverSeq");

  const broadcast = await waitForMessage(
    tutorWs,
    (msg) => msg.type === "OP_BROADCAST" && msg.serverSeq === acceptedSeq,
  );
  assert(broadcast.opType === "OBJECT_ADD", "Expected OP_BROADCAST opType OBJECT_ADD");

  tutorWs.send(
    JSON.stringify({
      type: "OP_SUBMIT",
      sessionId,
      clientOpId,
      opType: "OBJECT_ADD",
      payload: { objectId: "smoke-1", kind: "rect" },
    }),
  );
  const duplicateAccepted = await waitForMessage(
    tutorWs,
    (msg) => msg.type === "OP_ACCEPTED" && msg.clientOpId === clientOpId,
  );
  assert(
    duplicateAccepted.serverSeq === acceptedSeq,
    "Expected duplicate OP_ACCEPTED to reuse same serverSeq",
  );

  const opCount = await prisma.whiteboardOp.count({
    where: {
      sessionId,
      actorUserId: tutor.id,
      clientOpId,
    },
  });
  assert(opCount === 1, `Expected exactly one persisted op for duplicate clientOpId, got ${opCount}`);

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "ENDED",
      endedAt: new Date(),
    },
  });

  const endedOpId = randomUUID();
  tutorWs.send(
    JSON.stringify({
      type: "OP_SUBMIT",
      sessionId,
      clientOpId: endedOpId,
      opType: "OBJECT_ADD",
      payload: { objectId: "smoke-ended", kind: "rect" },
    }),
  );

  const rejected = await waitForMessage(
    tutorWs,
    (msg) => msg.type === "OP_REJECTED" && msg.clientOpId === endedOpId,
  );
  assert(rejected.code === "SESSION_ENDED", `Expected SESSION_ENDED rejection, got ${rejected.code}`);

  tutorWs.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionId,
        serverSeq: acceptedSeq,
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
