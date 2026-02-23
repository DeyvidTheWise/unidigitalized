import type { IncomingMessage } from "node:http";
import { verifyAccessToken, isTokenExpiredError } from "../lib/auth/tokens";

export type WsAuthUser = {
  userId: string;
  role: "ADMIN" | "TUTOR" | "STUDENT";
};

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const segment of cookieHeader.split(";")) {
    const [k, ...rest] = segment.trim().split("=");
    if (!k) continue;
    result[k] = decodeURIComponent(rest.join("="));
  }
  return result;
}

export function authenticateUpgradeRequest(request: IncomingMessage):
  | { ok: true; user: WsAuthUser }
  | { ok: false; closeCode: number; reason: string } {
  const cookies = parseCookies(request.headers.cookie);
  const accessToken = cookies.access_token;

  if (!accessToken) {
    return { ok: false, closeCode: 4401, reason: "NOT_AUTHENTICATED" };
  }

  try {
    const payload = verifyAccessToken(accessToken);
    return {
      ok: true,
      user: {
        userId: payload.sub,
        role: payload.role,
      },
    };
  } catch (error) {
    if (isTokenExpiredError(error)) {
      return { ok: false, closeCode: 4401, reason: "TOKEN_EXPIRED" };
    }
    return { ok: false, closeCode: 4401, reason: "NOT_AUTHENTICATED" };
  }
}
