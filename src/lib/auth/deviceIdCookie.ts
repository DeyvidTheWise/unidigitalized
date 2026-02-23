import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const DEVICE_ID_COOKIE_NAME = "ud_device_id";
const DEVICE_ID_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function resolveDeviceId(request: Pick<NextRequest, "cookies">): string {
  const existing = request.cookies.get(DEVICE_ID_COOKIE_NAME)?.value;
  if (existing && existing.length >= 16) {
    return existing;
  }
  return crypto.randomUUID();
}

export function getOrSetDeviceIdCookie(
  request: Pick<NextRequest, "cookies">,
  response: NextResponse,
): string {
  const deviceId = resolveDeviceId(request);
  response.cookies.set(DEVICE_ID_COOKIE_NAME, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: DEVICE_ID_MAX_AGE_SECONDS,
  });
  return deviceId;
}
