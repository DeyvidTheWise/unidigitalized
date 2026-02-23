import { NextRequest, NextResponse } from "next/server";
import { authCookieNames, ensureDeviceIdCookie, setAuthCookies } from "@/src/lib/auth/cookies";
import { computeDeviceFingerprint } from "@/src/lib/auth/device";
import { handleAuthError, jsonError } from "@/src/lib/auth/http";
import { loginUser } from "@/src/lib/auth/service";
import { checkRateLimit } from "@/src/lib/security/rateLimit";
import { withRequestLogging } from "@/src/lib/logging/requestLogger";

function getClientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
}

export const POST = withRequestLogging("auth_login", async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit({
      key: `auth:login:${ip}`,
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.ok) {
      return jsonError(429, "RATE_LIMITED", "Too many login attempts. Please retry shortly.");
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel : undefined;

    if (!email || !password) {
      return jsonError(401, "INVALID_CREDENTIALS", "Email and password are required.");
    }

    const fingerprintHash = computeDeviceFingerprint(request);
    const result = await loginUser({
      email,
      password,
      fingerprintHash,
      request,
      deviceLabel,
      requestMeta: {
        ip,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });

    const response = NextResponse.json({ user: result.user });
    ensureDeviceIdCookie(response, request.cookies.get(authCookieNames.device)?.value);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return response;
  } catch (error) {
    return handleAuthError(error);
  }
});
