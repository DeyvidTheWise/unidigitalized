import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError, jsonApiError } from "@/src/lib/api/errors";
import { hashPassword } from "@/src/lib/auth/password";
import { deleteUserCascade } from "@/src/lib/admin/service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id } = await context.params;
    const body = await request.json();

    const data: { firstName?: string; lastName?: string; email?: string; role?: UserRole; passwordHash?: string } = {};
    if (typeof body?.firstName === "string" && body.firstName.trim().length > 0) {
      data.firstName = body.firstName.trim();
    }
    if (typeof body?.lastName === "string" && body.lastName.trim().length > 0) {
      data.lastName = body.lastName.trim();
    }
    if (typeof body?.email === "string" && body.email.trim().length > 0) {
      data.email = body.email.trim().toLowerCase();
    }
    if (body?.role && Object.values(UserRole).includes(body.role)) {
      data.role = body.role;
    }
    if (typeof body?.password === "string" && body.password.length >= 8) {
      data.passwordHash = await hashPassword(body.password);
    }

    if (!Object.keys(data).length) {
      return jsonApiError(400, "VALIDATION_ERROR", "No update payload provided.");
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id } = await context.params;

    if (id === user.id) {
      return jsonApiError(400, "VALIDATION_ERROR", "Admin cannot delete own account.");
    }

    await deleteUserCascade(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
