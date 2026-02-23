import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { computeDeviceFingerprint } from "../src/lib/auth/device";
import { hashPassword } from "../src/lib/auth/password";
import { loginUser } from "../src/lib/auth/service";
import { POST as createSessionRoute } from "../app/api/sessions/route";
import { GET as getSessionRoute } from "../app/api/sessions/[id]/route";
import { POST as addParticipantRoute } from "../app/api/sessions/[id]/participants/route";
import {
  PATCH as patchParticipantRoute,
  DELETE as deleteParticipantRoute,
} from "../app/api/sessions/[id]/participants/[participantUserId]/route";
import { POST as startSessionRoute } from "../app/api/sessions/[id]/start/route";
import { POST as endSessionRoute } from "../app/api/sessions/[id]/end/route";
import { GET as recapRoute } from "../app/api/sessions/[id]/recap/route";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeRequest(params: {
  path: string;
  method: string;
  body?: unknown;
  accessToken?: string;
  deviceId: string;
  userAgent: string;
}): NextRequest {
  const headers = new Headers();
  headers.set("accept-language", "en-US");
  headers.set("user-agent", params.userAgent);

  const cookies = [`device_id=${params.deviceId}`];
  if (params.accessToken) {
    cookies.push(`access_token=${params.accessToken}`);
  }
  headers.set("cookie", cookies.join("; "));

  let body: string | undefined;
  if (params.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(params.body);
  }

  return new NextRequest(new Request(`http://localhost${params.path}`, {
    method: params.method,
    headers,
    body,
  }));
}

async function loginAs(email: string, password: string, deviceId: string, userAgent: string) {
  const req = makeRequest({
    path: "/api/auth/login",
    method: "POST",
    deviceId,
    userAgent,
  });

  const fingerprintHash = computeDeviceFingerprint(req);

  return loginUser({
    email,
    password,
    fingerprintHash,
    request: req,
  });
}

async function expectError(response: Response, status: number, code: string) {
  assert(response.status === status, `Expected status ${status}, got ${response.status}`);
  const data = await response.json();
  assert(data?.error?.code === code, `Expected error code ${code}, got ${data?.error?.code}`);
}

async function createTempUser(role: "TUTOR" | "STUDENT") {
  const email = `phase3-${role.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@test.local`;
  const password = "Password123!";
  const user = await prisma.user.create({
    data: {
      firstName: role === "TUTOR" ? "Tutor" : "Student",
      lastName: "Lifecycle",
      email,
      passwordHash: await hashPassword(password),
      role,
    },
    select: { id: true, email: true },
  });
  return { ...user, password };
}

async function main() {
  const tutorUser = await createTempUser("TUTOR");
  const studentUser = await createTempUser("STUDENT");
  const extraUser = await createTempUser("STUDENT");

  const tutorDeviceId = `phase3-tutor-${Date.now()}`;
  const studentDeviceId = `phase3-student-${Date.now()}`;

  const tutorLogin = await loginAs(
    tutorUser.email,
    tutorUser.password,
    tutorDeviceId,
    "Phase3Tutor/1.0",
  );

  const studentLogin = await loginAs(
    studentUser.email,
    studentUser.password,
    studentDeviceId,
    "Phase3Student/1.0",
  );

  const createReq = makeRequest({
    path: "/api/sessions",
    method: "POST",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
    body: {
      title: "Phase 3 Lifecycle Session",
      scheduledStartAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      participantUserIds: [],
    },
  });

  const createRes = await createSessionRoute(createReq);
  assert(createRes.status === 200, `session create failed with ${createRes.status}`);
  const createJson = await createRes.json();
  const sessionId = createJson?.session?.id as string;
  assert(sessionId, "session id missing");

  const addReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants`,
    method: "POST",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
    body: { userId: studentUser.id, roleInSession: "STUDENT" },
  });
  const addRes = await addParticipantRoute(addReq, { params: Promise.resolve({ id: sessionId }) });
  assert(addRes.status === 200, `add participant failed with ${addRes.status}`);

  const addAdminReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants`,
    method: "POST",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
    body: { userId: extraUser.id, roleInSession: "STUDENT" },
  });
  const addAdminRes = await addParticipantRoute(addAdminReq, { params: Promise.resolve({ id: sessionId }) });
  assert(addAdminRes.status === 200, `add admin as participant failed with ${addAdminRes.status}`);

  const removeAdminReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants/${extraUser.id}`,
    method: "DELETE",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
  });
  const removeAdminRes = await deleteParticipantRoute(removeAdminReq, {
    params: Promise.resolve({ id: sessionId, participantUserId: extraUser.id }),
  });
  assert(removeAdminRes.status === 200, `remove admin participant failed with ${removeAdminRes.status}`);

  const patchTrueReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants/${studentUser.id}`,
    method: "PATCH",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
    body: { canDraw: true },
  });
  const patchTrueRes = await patchParticipantRoute(patchTrueReq, {
    params: Promise.resolve({ id: sessionId, participantUserId: studentUser.id }),
  });
  assert(patchTrueRes.status === 200, `patch true failed with ${patchTrueRes.status}`);

  const patchFalseReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants/${studentUser.id}`,
    method: "PATCH",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
    body: { canDraw: false },
  });
  const patchFalseRes = await patchParticipantRoute(patchFalseReq, {
    params: Promise.resolve({ id: sessionId, participantUserId: studentUser.id }),
  });
  assert(patchFalseRes.status === 200, `patch false failed with ${patchFalseRes.status}`);

  const startReq = makeRequest({
    path: `/api/sessions/${sessionId}/start`,
    method: "POST",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
  });
  const startRes = await startSessionRoute(startReq, { params: Promise.resolve({ id: sessionId }) });
  assert(startRes.status === 200, `start failed with ${startRes.status}`);

  const endReq = makeRequest({
    path: `/api/sessions/${sessionId}/end`,
    method: "POST",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
  });
  const endRes = await endSessionRoute(endReq, { params: Promise.resolve({ id: sessionId }) });
  assert(endRes.status === 200, `end failed with ${endRes.status}`);

  const addAfterEndReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants`,
    method: "POST",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
    body: { userId: extraUser.id },
  });
  const addAfterEndRes = await addParticipantRoute(addAfterEndReq, { params: Promise.resolve({ id: sessionId }) });
  await expectError(addAfterEndRes, 409, "SESSION_ENDED");

  const patchAfterEndReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants/${studentUser.id}`,
    method: "PATCH",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
    body: { canDraw: true },
  });
  const patchAfterEndRes = await patchParticipantRoute(patchAfterEndReq, {
    params: Promise.resolve({ id: sessionId, participantUserId: studentUser.id }),
  });
  await expectError(patchAfterEndRes, 409, "SESSION_ENDED");

  const removeAfterEndReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants/${studentUser.id}`,
    method: "DELETE",
    accessToken: tutorLogin.accessToken,
    deviceId: tutorDeviceId,
    userAgent: "Phase3Tutor/1.0",
  });
  const removeAfterEndRes = await deleteParticipantRoute(removeAfterEndReq, {
    params: Promise.resolve({ id: sessionId, participantUserId: studentUser.id }),
  });
  await expectError(removeAfterEndRes, 409, "SESSION_ENDED");

  const studentSessionReq = makeRequest({
    path: `/api/sessions/${sessionId}`,
    method: "GET",
    accessToken: studentLogin.accessToken,
    deviceId: studentDeviceId,
    userAgent: "Phase3Student/1.0",
  });
  const studentSessionRes = await getSessionRoute(studentSessionReq, { params: Promise.resolve({ id: sessionId }) });
  assert(studentSessionRes.status === 200, `student get session failed ${studentSessionRes.status}`);

  const studentRecapReq = makeRequest({
    path: `/api/sessions/${sessionId}/recap`,
    method: "GET",
    accessToken: studentLogin.accessToken,
    deviceId: studentDeviceId,
    userAgent: "Phase3Student/1.0",
  });
  const studentRecapRes = await recapRoute(studentRecapReq, { params: Promise.resolve({ id: sessionId }) });
  assert(studentRecapRes.status === 200, `student recap failed ${studentRecapRes.status}`);

  const studentStartReq = makeRequest({
    path: `/api/sessions/${sessionId}/start`,
    method: "POST",
    accessToken: studentLogin.accessToken,
    deviceId: studentDeviceId,
    userAgent: "Phase3Student/1.0",
  });
  const studentStartRes = await startSessionRoute(studentStartReq, { params: Promise.resolve({ id: sessionId }) });
  await expectError(studentStartRes, 403, "FORBIDDEN");

  const studentMutateReq = makeRequest({
    path: `/api/sessions/${sessionId}/participants/${studentUser.id}`,
    method: "PATCH",
    accessToken: studentLogin.accessToken,
    deviceId: studentDeviceId,
    userAgent: "Phase3Student/1.0",
    body: { canDraw: true },
  });
  const studentMutateRes = await patchParticipantRoute(studentMutateReq, {
    params: Promise.resolve({ id: sessionId, participantUserId: studentUser.id }),
  });
  await expectError(studentMutateRes, 403, "FORBIDDEN");

  console.log(JSON.stringify({ ok: true, sessionId }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
