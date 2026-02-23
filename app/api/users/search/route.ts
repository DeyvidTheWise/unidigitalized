import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { jsonApiError, handleApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    if (user.role !== "ADMIN" && user.role !== "TUTOR") {
      return jsonApiError(403, "FORBIDDEN", "Only tutor/admin can search users.");
    }

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    const dualToken = tokens.length >= 2 ? { first: tokens[0], last: tokens.slice(1).join(" ") } : null;

    const baseWhere = {
      OR: [
        { firstName: { startsWith: q, mode: "insensitive" as const } },
        { lastName: { startsWith: q, mode: "insensitive" as const } },
        ...(dualToken
          ? [{
              AND: [
                { firstName: { contains: dualToken.first, mode: "insensitive" as const } },
                { lastName: { contains: dualToken.last, mode: "insensitive" as const } },
              ],
            }]
          : []),
      ],
    };

    const starts = await prisma.user.findMany({
      where: {
        ...baseWhere,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 12,
    });

    const contains = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              ...(dualToken
                ? [{
                    AND: [
                      { firstName: { contains: dualToken.first, mode: "insensitive" as const } },
                      { lastName: { contains: dualToken.last, mode: "insensitive" as const } },
                    ],
                  }]
                : []),
            ],
          },
          {
            NOT: {
              id: { in: starts.map((u) => u.id) },
            },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 8,
    });

    return NextResponse.json({ users: [...starts, ...contains] });
  } catch (error) {
    return handleApiError(error);
  }
}
