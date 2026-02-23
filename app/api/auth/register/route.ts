import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { setAuthCookies } from "@/src/lib/auth/cookies";
import { handleAuthError, jsonError } from "@/src/lib/auth/http";
import { registerUser } from "@/src/lib/auth/service";
import { checkRateLimit } from "@/src/lib/security/rateLimit";
import { withRequestLogging } from "@/src/lib/logging/requestLogger";
import { getOrSetDeviceIdCookie, resolveDeviceId } from "@/src/lib/auth/deviceIdCookie";

function getClientIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
}

function isValidName(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z][A-Za-z -]{1,39}$/.test(trimmed);
}

export const POST = withRequestLogging("auth_register", async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit({
      key: `auth:register:${ip}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.ok) {
      return jsonError(429, "RATE_LIMITED", "Too many registration attempts. Please retry shortly.");
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel : undefined;

    if (!email || !password || !firstName || !lastName || password.length < 8) {
      return jsonError(400, "VALIDATION_ERROR", "firstName, lastName, email and password are required.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError(400, "VALIDATION_ERROR", "Invalid email format.");
    }
    if (!isValidName(firstName) || !isValidName(lastName)) {
      return jsonError(400, "VALIDATION_ERROR", "Names must be 2-40 chars, letters/spaces/hyphen only.");
    }

    const deviceId = resolveDeviceId(request);
    const requestedRole = body?.role as UserRole | undefined;

    const result = await registerUser({
      email,
      firstName,
      lastName,
      password,
      role: requestedRole && requestedRole === UserRole.STUDENT ? requestedRole : UserRole.STUDENT,
      deviceId,
      userAgent: request.headers.get("user-agent"),
      deviceLabel,
      requestMeta: {
        ip,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });

    const response = NextResponse.json({ user: result.user });
    getOrSetDeviceIdCookie(request, response);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "EMAIL_ALREADY_EXISTS", "Email is already registered.");
    }
    return handleAuthError(error);
  }
});
