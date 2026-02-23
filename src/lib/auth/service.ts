import type { NextRequest } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../prisma";
import { computeDeviceFingerprintForUser, deriveDeviceLabel, upsertDeviceForUser, verifyDevice } from "./device";
import { hashPassword, verifyPassword } from "./password";
import {
  createAccessToken,
  createRefreshToken,
  hashToken,
  isTokenExpiredError,
  refreshTtlDays,
  verifyAccessToken,
} from "./tokens";
import { AuthError, PublicUser } from "./types";

function nowPlusDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeUser(user: { id: string; firstName: string; lastName: string; email: string; role: UserRole }): PublicUser {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role };
}

type RequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

export async function registerUser(params: {
  email: string;
  firstName?: string;
  lastName?: string;
  password: string;
  deviceId?: string;
  fingerprintHash?: string;
  userAgent?: string | null;
  request?: Pick<NextRequest, "headers">;
  deviceLabel?: string;
  role?: UserRole;
  requestMeta?: RequestMeta;
}) {
  const email = normalizeEmail(params.email);
  const passwordHash = await hashPassword(params.password);
  const role = params.role ?? UserRole.STUDENT;

  let createdUser: { id: string; firstName: string; lastName: string; email: string; role: UserRole };
  try {
    createdUser = await prisma.user.create({
      data: {
        firstName: (params.firstName?.trim() || "User").slice(0, 40),
        lastName: (params.lastName?.trim() || "Local").slice(0, 40),
        email,
        passwordHash,
        role,
      },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthError(409, "EMAIL_ALREADY_EXISTS", "Email is already registered.");
    }
    throw error;
  }

  const fingerprintHash =
    params.fingerprintHash ??
    computeDeviceFingerprintForUser(createdUser.id, params.deviceId ?? "legacy-device");
  const device = await upsertDeviceForUser(
    createdUser.id,
    fingerprintHash,
    deriveDeviceLabel(params.userAgent ?? params.request?.headers.get("user-agent"), params.deviceLabel),
  );
  const verifiedDevice = await verifyDevice(createdUser.id, device.id, { bypassLimit: createdUser.role === "ADMIN" });

  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      userId: createdUser.id,
      deviceId: verifiedDevice.id,
      tokenHash: refreshTokenHash,
      expiresAt: nowPlusDays(refreshTtlDays()),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: createdUser.id,
      action: "AUTH_REGISTER",
      targetType: "USER",
      targetId: createdUser.id,
      ip: params.requestMeta?.ip ?? null,
      userAgent: params.requestMeta?.userAgent ?? null,
      metadata: {
        deviceId: verifiedDevice.id,
      },
    },
  });

  const accessToken = createAccessToken({
    sub: createdUser.id,
    email: createdUser.email,
    role: createdUser.role,
    deviceId: verifiedDevice.id,
  });

  return {
    user: sanitizeUser(createdUser),
    accessToken,
    refreshToken,
    device: verifiedDevice,
  };
}

export async function loginUser(params: {
  email: string;
  password: string;
  deviceId?: string;
  fingerprintHash?: string;
  userAgent?: string | null;
  request?: Pick<NextRequest, "headers">;
  deviceLabel?: string;
  requestMeta?: RequestMeta;
}) {
  const email = normalizeEmail(params.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new AuthError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const passwordOk = await verifyPassword(params.password, user.passwordHash);
  if (!passwordOk) {
    throw new AuthError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const fingerprintHash =
    params.fingerprintHash ??
    computeDeviceFingerprintForUser(user.id, params.deviceId ?? "legacy-device");
  const device = await upsertDeviceForUser(
    user.id,
    fingerprintHash,
    deriveDeviceLabel(params.userAgent ?? params.request?.headers.get("user-agent"), params.deviceLabel),
  );
  const verifiedDevice = await verifyDevice(user.id, device.id, { bypassLimit: user.role === "ADMIN" });

  await prisma.refreshToken.updateMany({
    where: {
      userId: user.id,
      deviceId: verifiedDevice.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      revokedAt: new Date(),
    },
  });

  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      deviceId: verifiedDevice.id,
      tokenHash: refreshTokenHash,
      expiresAt: nowPlusDays(refreshTtlDays()),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      targetType: "USER",
      targetId: user.id,
      ip: params.requestMeta?.ip ?? null,
      userAgent: params.requestMeta?.userAgent ?? null,
      metadata: {
        deviceId: verifiedDevice.id,
      },
    },
  });

  const accessToken = createAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    deviceId: verifiedDevice.id,
  });

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
    device: verifiedDevice,
  };
}

export async function refreshSession(params: { refreshToken: string }) {
  const tokenHash = hashToken(params.refreshToken);

  const current = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      },
      device: true,
    },
  });

  if (!current || current.revokedAt) {
    throw new AuthError(401, "TOKEN_INVALID", "Refresh token is invalid.");
  }

  if (current.expiresAt <= new Date()) {
    await prisma.refreshToken.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });
    throw new AuthError(401, "TOKEN_EXPIRED", "Refresh token has expired.");
  }

  if (!current.device.verifiedAt || current.device.revokedAt) {
    throw new AuthError(403, "DEVICE_NOT_VERIFIED", "Verified device is required.");
  }

  const nextRefreshToken = createRefreshToken();
  const nextRefreshTokenHash = hashToken(nextRefreshToken);

  const rotated = await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });

    const created = await tx.refreshToken.create({
      data: {
        userId: current.userId,
        deviceId: current.deviceId,
        tokenHash: nextRefreshTokenHash,
        expiresAt: nowPlusDays(refreshTtlDays()),
      },
    });

    await tx.refreshToken.update({
      where: { id: current.id },
      data: { replacedByTokenId: created.id },
    });

    return created;
  });

  const accessToken = createAccessToken({
    sub: current.user.id,
    email: current.user.email,
    role: current.user.role,
    deviceId: current.deviceId,
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    refreshTokenId: rotated.id,
  };
}

export async function logoutSession(params: { refreshToken?: string; actorUserId?: string | null; requestMeta?: RequestMeta }) {
  if (params.refreshToken) {
    const tokenHash = hashToken(params.refreshToken);
    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  if (params.actorUserId) {
    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: "AUTH_LOGOUT",
        targetType: "USER",
        targetId: params.actorUserId,
        ip: params.requestMeta?.ip ?? null,
        userAgent: params.requestMeta?.userAgent ?? null,
      },
    });
  }

  return { ok: true };
}

export function assertValidAccessToken(token: string) {
  try {
    return verifyAccessToken(token);
  } catch (error) {
    if (isTokenExpiredError(error)) {
      throw new AuthError(401, "TOKEN_EXPIRED", "Access token has expired.");
    }
    throw new AuthError(401, "TOKEN_INVALID", "Access token is invalid.");
  }
}
