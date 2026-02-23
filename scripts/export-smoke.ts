import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { computeDeviceFingerprint } from "../src/lib/auth/device";
import { loginUser } from "../src/lib/auth/service";
import { POST as createExportPdfRoute } from "../app/api/sessions/[id]/export/pdf/route";
import { GET as downloadExportRoute } from "../app/api/exports/[exportId]/download/route";
import { runExportCleanupOnce } from "../src/exports/cleanupExpiredExports";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeRequest(params: {
  path: string;
  method: string;
  deviceId: string;
  accessToken: string;
  userAgent?: string;
  body?: unknown;
}): NextRequest {
  const headers = new Headers();
  headers.set("user-agent", params.userAgent ?? "ExportSmoke/1.0");
  headers.set("accept-language", "en-US");
  headers.set("cookie", `device_id=${params.deviceId}; access_token=${params.accessToken}`);

  let body: string | undefined;
  if (params.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(params.body);
  }

  return new NextRequest(
    new Request(`http://localhost${params.path}`, {
      method: params.method,
      headers,
      body,
    }),
  );
}

async function createTempTutor() {
  const email = `export-tutor-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.local`;
  const password = "Password123!";

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "TUTOR",
    },
    select: { id: true, email: true },
  });

  return { ...user, password };
}

async function main() {
  const tutor = await createTempTutor();
  const deviceId = `export-smoke-${Date.now()}`;

  const loginReq = makeRequest({
    path: "/api/auth/login",
    method: "POST",
    deviceId,
    accessToken: "placeholder",
  });

  const login = await loginUser({
    email: tutor.email,
    password: tutor.password,
    fingerprintHash: computeDeviceFingerprint(loginReq),
    request: loginReq,
    deviceLabel: "Export Smoke Device",
  });

  const session = await prisma.session.create({
    data: {
      title: `Export Smoke Session ${Date.now()}`,
      scheduledStartAt: new Date(Date.now() - 10 * 60_000),
      actualStartAt: new Date(Date.now() - 9 * 60_000),
      endedAt: new Date(Date.now() - 1 * 60_000),
      status: "ENDED",
      createdByUserId: tutor.id,
    },
    select: { id: true },
  });

  await prisma.sessionParticipant.create({
    data: {
      sessionId: session.id,
      userId: tutor.id,
      roleInSession: "TUTOR",
      canDraw: false,
      joinedAt: new Date(Date.now() - 10 * 60_000),
    },
  });

  await prisma.whiteboardSnapshot.create({
    data: {
      sessionId: session.id,
      lastServerSeq: BigInt(0),
      state: {
        objectsById: {
          txt1: {
            objectType: "text",
            id: "txt1",
            x: 120,
            y: 140,
            text: "Export smoke",
            fontSize: 24,
            color: "#111827",
            createdBy: tutor.id,
          },
        },
        zOrder: ["txt1"],
        version: { lastServerSeq: 0 },
      },
    },
  });

  const exportReq = makeRequest({
    path: `/api/sessions/${session.id}/export/pdf`,
    method: "POST",
    deviceId,
    accessToken: login.accessToken,
  });

  const exportRes = await createExportPdfRoute(exportReq, { params: Promise.resolve({ id: session.id }) });
  assert(exportRes.status === 200, `export create failed with ${exportRes.status}`);
  const exportJson = await exportRes.json();
  const exportId = exportJson?.exportId as string;
  assert(exportId, "exportId missing");

  const downloadReq = makeRequest({
    path: `/api/exports/${exportId}/download`,
    method: "GET",
    deviceId,
    accessToken: login.accessToken,
  });

  const downloadRes = await downloadExportRoute(downloadReq, { params: Promise.resolve({ exportId }) });
  assert(downloadRes.status === 200, `download failed with ${downloadRes.status}`);
  assert(downloadRes.headers.get("Content-Type") === "application/pdf", "expected pdf content type");

  const pdfBytes = Buffer.from(await downloadRes.arrayBuffer());
  assert(pdfBytes.length > 1024, `expected pdf size > 1KB, got ${pdfBytes.length}`);

  await prisma.export.update({
    where: { id: exportId },
    data: {
      expiresAt: new Date(Date.now() - 60_000),
    },
  });

  await runExportCleanupOnce();

  const afterCleanup = await prisma.export.findUnique({
    where: { id: exportId },
    select: { deletedAt: true },
  });
  assert(afterCleanup?.deletedAt, "expected deletedAt after cleanup");

  const expiredDownloadReq = makeRequest({
    path: `/api/exports/${exportId}/download`,
    method: "GET",
    deviceId,
    accessToken: login.accessToken,
  });
  const expiredDownloadRes = await downloadExportRoute(expiredDownloadReq, { params: Promise.resolve({ exportId }) });
  assert(
    expiredDownloadRes.status === 410 || expiredDownloadRes.status === 404,
    `expected 410/404 after expiration, got ${expiredDownloadRes.status}`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        exportId,
        pdfBytes: pdfBytes.length,
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
