import { NextRequest, NextResponse } from "next/server";
import { authCookieNames, setAuthCookies } from "@/src/lib/auth/cookies";
import { handleAuthError, jsonError } from "@/src/lib/auth/http";
import { refreshSession } from "@/src/lib/auth/service";
import { decodeJwtNoVerify } from "@/src/lib/auth/tokens";
import { checkRateLimit } from "@/src/lib/security/rateLimit";
import { withRequestLogging } from "@/src/lib/logging/requestLogger";

function getClientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
}

export const POST = withRequestLogging("auth_refresh", async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get(authCookieNames.access)?.value;
    let userId = "anonymous";
    if (accessToken) {
      const decoded = decodeJwtNoVerify(accessToken);
      if (decoded && typeof decoded === "object" && typeof decoded.sub === "string") {
        userId = decoded.sub;
      }
    }
    const ip = getClientIp(request);
    const rate = checkRateLimit({
      key: `auth:refresh:${userId !== "anonymous" ? userId : ip}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.ok) {
      return jsonError(429, "RATE_LIMITED", "Too many refresh attempts. Please retry shortly.");
    }

    const refreshToken = request.cookies.get(authCookieNames.refresh)?.value;
    if (!refreshToken) {
      return jsonError(401, "TOKEN_INVALID", "Refresh token is missing.");
    }

    const rotated = await refreshSession({ refreshToken });
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, rotated.accessToken, rotated.refreshToken);
    return response;
  } catch (error) {
    return handleAuthError(error);
  }
});
