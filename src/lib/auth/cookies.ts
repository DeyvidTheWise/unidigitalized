import crypto from "node:crypto";
import type { NextResponse } from "next/server";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const DEVICE_COOKIE = "device_id";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function accessTtlSeconds(): number {
  const minutes = Number.parseInt(process.env.ACCESS_TOKEN_TTL_MINUTES ?? "15", 10);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60;
}

function refreshTtlSeconds(): number {
  const days = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? "30", 10);
  return (Number.isFinite(days) && days > 0 ? days : 30) * 24 * 60 * 60;
}

export function ensureDeviceIdCookie(response: NextResponse, existing?: string): string {
  const deviceId = existing ?? crypto.randomBytes(24).toString("base64url");
  response.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return deviceId;
}

export function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string): void {
  response.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: accessTtlSeconds(),
  });

  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: refreshTtlSeconds(),
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    expires: new Date(0),
  });

  response.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    expires: new Date(0),
  });
}

export const authCookieNames = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
  device: DEVICE_COOKIE,
};
