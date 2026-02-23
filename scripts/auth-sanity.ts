import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { computeDeviceFingerprint } from "../src/lib/auth/device";
import { requireAuth } from "../src/lib/auth/requireAuth";
import { loginUser, logoutSession, refreshSession, registerUser } from "../src/lib/auth/service";
import { AuthError } from "../src/lib/auth/types";

function makeRequest(params: {
  path: string;
  deviceId: string;
  userAgent?: string;
  language?: string;
  accessToken?: string;
  refreshToken?: string;
}): NextRequest {
  const headers = new Headers();
  headers.set("user-agent", params.userAgent ?? "SanityAgent/1.0");
  headers.set("accept-language", params.language ?? "en-US");

  const cookieParts: string[] = [`device_id=${params.deviceId}`];
  if (params.accessToken) cookieParts.push(`access_token=${params.accessToken}`);
  if (params.refreshToken) cookieParts.push(`refresh_token=${params.refreshToken}`);
  headers.set("cookie", cookieParts.join("; "));

  return new NextRequest(new Request(`http://localhost${params.path}`, { headers }));
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runMainFlow() {
  const suffix = Date.now();
  const email = `phase2-main-${suffix}@test.local`;
  const password = "Password123!";
  const deviceId = `main-device-${suffix}`;

  const registerRequest = makeRequest({ path: "/api/auth/register", deviceId });
  const registerFingerprint = computeDeviceFingerprint(registerRequest);

  await registerUser({
    email,
    password,
    role: UserRole.STUDENT,
    fingerprintHash: registerFingerprint,
    request: registerRequest,
  });

  const loginRequest = makeRequest({ path: "/api/auth/login", deviceId });
  const loginFingerprint = computeDeviceFingerprint(loginRequest);
  const login = await loginUser({
    email,
    password,
    fingerprintHash: loginFingerprint,
    request: loginRequest,
  });

  const meRequest = makeRequest({
    path: "/api/auth/me",
    deviceId,
    accessToken: login.accessToken,
  });
  const me = await requireAuth(meRequest);
  ensure(me.user.email === email, "Expected /me to return registered user");

  const rotated = await refreshSession({ refreshToken: login.refreshToken });
  ensure(rotated.accessToken.length > 0, "Expected rotated access token");

  let oldTokenRejected = false;
  try {
    await refreshSession({ refreshToken: login.refreshToken });
  } catch (error) {
    if (error instanceof AuthError && error.code === "TOKEN_INVALID") {
      oldTokenRejected = true;
    }
  }
  ensure(oldTokenRejected, "Expected old refresh token to be invalid after rotation");

  await logoutSession({ refreshToken: rotated.refreshToken, actorUserId: me.user.id });

  let meRejectedAfterLogout = false;
  try {
    const noTokenRequest = makeRequest({ path: "/api/auth/me", deviceId });
    await requireAuth(noTokenRequest);
  } catch (error) {
    if (error instanceof AuthError && (error.code === "TOKEN_INVALID" || error.code === "TOKEN_EXPIRED")) {
      meRejectedAfterLogout = true;
    }
  }
  ensure(meRejectedAfterLogout, "Expected /me to fail after logout without token cookie");

  return { email };
}

async function runDeviceLimitFlow() {
  const suffix = Date.now();
  const email = `phase2-limit-${suffix}@test.local`;
  const password = "Password123!";

  const registerDevice = `limit-device-1-${suffix}`;
  const registerRequest = makeRequest({ path: "/api/auth/register", deviceId: registerDevice, userAgent: "LimitAgent/1" });
  await registerUser({
    email,
    password,
    role: UserRole.STUDENT,
    fingerprintHash: computeDeviceFingerprint(registerRequest),
    request: registerRequest,
  });

  for (let i = 2; i <= 3; i += 1) {
    const deviceId = `limit-device-${i}-${suffix}`;
    const req = makeRequest({ path: "/api/auth/login", deviceId, userAgent: `LimitAgent/${i}` });
    await loginUser({
      email,
      password,
      fingerprintHash: computeDeviceFingerprint(req),
      request: req,
    });
  }

  const fourthReq = makeRequest({ path: "/api/auth/login", deviceId: `limit-device-4-${suffix}`, userAgent: "LimitAgent/4" });

  let blocked = false;
  try {
    await loginUser({
      email,
      password,
      fingerprintHash: computeDeviceFingerprint(fourthReq),
      request: fourthReq,
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === "DEVICE_LIMIT_REACHED") {
      blocked = true;
    }
  }

  ensure(blocked, "Expected 4th device verification to be blocked");

  return { email };
}

async function main() {
  const main = await runMainFlow();
  const limit = await runDeviceLimitFlow();

  console.log(
    JSON.stringify(
      {
        ok: true,
        mainFlowUser: main.email,
        deviceLimitUser: limit.email,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
