import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { authCookieNames, ensureDeviceIdCookie, setAuthCookies } from "@/src/lib/auth/cookies";
import { computeDeviceFingerprint } from "@/src/lib/auth/device";
import { handleAuthError, jsonError } from "@/src/lib/auth/http";
import { registerUser } from "@/src/lib/auth/service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel : undefined;

    if (!email || !password || password.length < 8) {
      return jsonError(401, "INVALID_CREDENTIALS", "Email and password are required.");
    }

    const fingerprintHash = computeDeviceFingerprint(request);
    const requestedRole = body?.role as UserRole | undefined;

    const result = await registerUser({
      email,
      password,
      role: requestedRole && requestedRole === UserRole.STUDENT ? requestedRole : UserRole.STUDENT,
      fingerprintHash,
      request,
      deviceLabel,
      requestMeta: {
        ip: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });

    const response = NextResponse.json({ user: result.user });
    ensureDeviceIdCookie(response, request.cookies.get(authCookieNames.device)?.value);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError(409, "EMAIL_ALREADY_EXISTS", "Email is already registered.");
    }
    return handleAuthError(error);
  }
}
