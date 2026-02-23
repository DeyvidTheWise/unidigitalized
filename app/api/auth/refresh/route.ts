import { NextRequest, NextResponse } from "next/server";
import { authCookieNames, setAuthCookies } from "@/src/lib/auth/cookies";
import { handleAuthError, jsonError } from "@/src/lib/auth/http";
import { refreshSession } from "@/src/lib/auth/service";

export async function POST(request: NextRequest) {
  try {
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
}
