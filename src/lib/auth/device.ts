import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { AuthError } from "./types";

export function computeDeviceFingerprint(request: Pick<NextRequest, "headers" | "cookies">): string {
  const userAgent = request.headers.get("user-agent") ?? "";
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const stableClientId = request.cookies.get("device_id")?.value ?? "";

  return crypto
    .createHash("sha256")
    .update(`${userAgent}|${acceptLanguage}|${stableClientId}`)
    .digest("hex");
}

export function deriveDeviceLabel(request: Pick<NextRequest, "headers">, explicitLabel?: string): string {
  if (explicitLabel && explicitLabel.trim().length > 0) {
    return explicitLabel.trim().slice(0, 100);
  }

  const userAgent = request.headers.get("user-agent") ?? "Unknown device";
  return userAgent.slice(0, 100);
}

export async function upsertDeviceForUser(userId: string, fingerprintHash: string, label?: string) {
  return prisma.device.upsert({
    where: {
      userId_fingerprintHash: {
        userId,
        fingerprintHash,
      },
    },
    update: {
      label: label ?? undefined,
      revokedAt: null,
    },
    create: {
      userId,
      fingerprintHash,
      label,
    },
  });
}

export async function enforceMaxVerifiedDevices(userId: string): Promise<void> {
  const verifiedCount = await prisma.device.count({
    where: {
      userId,
      verifiedAt: { not: null },
      revokedAt: null,
    },
  });

  if (verifiedCount >= 3) {
    throw new AuthError(403, "DEVICE_LIMIT_REACHED", "Maximum number of verified devices reached.");
  }
}

export async function verifyDevice(userId: string, deviceId: string) {
  const device = await prisma.device.findFirst({
    where: {
      id: deviceId,
      userId,
    },
  });

  if (!device) {
    throw new AuthError(403, "DEVICE_NOT_VERIFIED", "Device is not registered for this user.");
  }

  if (!device.verifiedAt || device.revokedAt) {
    await enforceMaxVerifiedDevices(userId);
    return prisma.device.update({
      where: { id: deviceId },
      data: {
        verifiedAt: new Date(),
        revokedAt: null,
      },
    });
  }

  return device;
}
