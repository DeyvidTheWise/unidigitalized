import type { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { authCookieNames } from "./cookies";
import { computeDeviceFingerprintForUser } from "./device";
import { assertValidAccessToken } from "./service";
import { AuthError } from "./types";
import { DEVICE_ID_COOKIE_NAME } from "./deviceIdCookie";

export async function requireAuth(request: NextRequest) {
  const bearer = request.headers.get("authorization");
  const bearerToken = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  const accessToken = request.cookies.get(authCookieNames.access)?.value ?? bearerToken;

  if (!accessToken) {
    throw new AuthError(401, "TOKEN_INVALID", "Access token is missing.");
  }

  const payload = assertValidAccessToken(accessToken);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
  });

  if (!user) {
    throw new AuthError(401, "TOKEN_INVALID", "User no longer exists.");
  }

  const deviceId = request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value;
  if (!deviceId) {
    throw new AuthError(403, "DEVICE_NOT_VERIFIED", "Verified device is required.");
  }

  const fingerprintHash = computeDeviceFingerprintForUser(user.id, deviceId);
  const device = await prisma.device.findFirst({
    where: {
      userId: user.id,
      fingerprintHash,
      verifiedAt: { not: null },
      revokedAt: null,
    },
  });

  if (!device || device.id !== payload.deviceId) {
    throw new AuthError(403, "DEVICE_NOT_VERIFIED", "Verified device is required.");
  }

  return { user, device };
}
