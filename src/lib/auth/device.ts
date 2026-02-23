import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { AuthError } from "./types";

function devicePepper(): string {
  return process.env.JWT_REFRESH_PEPPER ?? "dev-refresh-pepper-change-me";
}

export function computeDeviceFingerprintForUser(userId: string, deviceId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${deviceId}:${devicePepper()}`)
    .digest("hex");
}

// Backward-compat helper for local scripts; route handlers should use computeDeviceFingerprintForUser.
export function computeDeviceFingerprint(request: Pick<NextRequest, "cookies">): string {
  const deviceId = request.cookies.get("ud_device_id")?.value ?? request.cookies.get("device_id")?.value ?? "";
  return crypto
    .createHash("sha256")
    .update(`legacy:${deviceId}:${devicePepper()}`)
    .digest("hex");
}

export function deriveDeviceLabel(userAgent: string | null | undefined, explicitLabel?: string): string {
  if (explicitLabel && explicitLabel.trim().length > 0) {
    return explicitLabel.trim().slice(0, 100);
  }

  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua) && !/Chrome\//.test(ua)
          ? "Safari"
          : "Browser";

  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";

  return `${browser} on ${os}`.slice(0, 100);
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

export async function verifyDevice(userId: string, deviceId: string, options?: { bypassLimit?: boolean }) {
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
    if (!options?.bypassLimit) {
      await enforceMaxVerifiedDevices(userId);
    }
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
