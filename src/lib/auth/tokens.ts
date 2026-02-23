import crypto from "node:crypto";
import jwt, { JwtPayload, TokenExpiredError } from "jsonwebtoken";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: "ADMIN" | "TUTOR" | "STUDENT";
  deviceId: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function accessTtlMinutes(): number {
  const raw = process.env.ACCESS_TOKEN_TTL_MINUTES ?? "15";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

export function refreshTtlDays(): number {
  const raw = process.env.REFRESH_TOKEN_TTL_DAYS ?? "30";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function createAccessToken(payload: AccessTokenPayload): string {
  const secret = requiredEnv("JWT_ACCESS_SECRET");
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: `${accessTtlMinutes()}m`,
  });
}

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  const pepper = requiredEnv("JWT_REFRESH_PEPPER");
  return crypto
    .createHash("sha256")
    .update(`${token}.${pepper}`)
    .digest("hex");
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = requiredEnv("JWT_ACCESS_SECRET");
  return jwt.verify(token, secret, { algorithms: ["HS256"] }) as AccessTokenPayload;
}

export function isTokenExpiredError(error: unknown): error is TokenExpiredError {
  return error instanceof TokenExpiredError;
}

export function decodeJwtNoVerify(token: string): JwtPayload | string | null {
  return jwt.decode(token);
}
