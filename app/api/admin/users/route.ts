import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError, jsonApiError } from "@/src/lib/api/errors";
import { hashPassword } from "@/src/lib/auth/password";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);

    const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() ?? "";
    const users = await prisma.user.findMany({
      where: query
        ? {
            OR: [{ email: { contains: query, mode: "insensitive" } }, { id: query }],
          }
        : undefined,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({ users });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);

    const body = await request.json();
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "User";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "Local";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const role = body?.role as UserRole | undefined;

    if (!email || !password || !role || !Object.values(UserRole).includes(role)) {
      return jsonApiError(400, "VALIDATION_ERROR", "email, password, role are required.");
    }

    const created = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        role,
        passwordHash: await hashPassword(password),
      },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ user: created });
  } catch (error) {
    return handleApiError(error);
  }
}
