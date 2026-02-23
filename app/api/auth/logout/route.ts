import { NextRequest, NextResponse } from "next/server";
import { authCookieNames, clearAuthCookies } from "@/src/lib/auth/cookies";
import { decodeJwtNoVerify } from "@/src/lib/auth/tokens";
import { logoutSession } from "@/src/lib/auth/service";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(authCookieNames.refresh)?.value;
  const accessToken = request.cookies.get(authCookieNames.access)?.value;

  let actorUserId: string | null = null;
  if (accessToken) {
    const decoded = decodeJwtNoVerify(accessToken);
    if (decoded && typeof decoded === "object" && typeof decoded.sub === "string") {
      actorUserId = decoded.sub;
    }
  }

  await logoutSession({
    refreshToken,
    actorUserId,
    requestMeta: {
      ip: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent") ?? null,
    },
  });

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
