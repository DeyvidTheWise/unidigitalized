import { NextRequest, NextResponse } from "next/server";
import { SessionStatus } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { handleApiError, jsonApiError } from "@/src/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);

    const status = request.nextUrl.searchParams.get("status") as SessionStatus | null;
    const sessions = await prisma.session.findMany({
      where: status && Object.values(SessionStatus).includes(status) ? { status } : undefined,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStartAt: true,
        actualStartAt: true,
        endedAt: true,
        createdByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 300,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const body = await request.json();

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const scheduledStartAt = new Date(body?.scheduledStartAt);
    const createdByUserId = typeof body?.createdByUserId === "string" ? body.createdByUserId : user.id;

    if (!title || Number.isNaN(scheduledStartAt.getTime())) {
      return jsonApiError(400, "VALIDATION_ERROR", "title and scheduledStartAt are required.");
    }

    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          title,
          scheduledStartAt,
          status: SessionStatus.SCHEDULED,
          createdByUserId,
        },
      });
      await tx.sessionParticipant.create({
        data: {
          sessionId: session.id,
          userId: createdByUserId,
          roleInSession: "TUTOR",
          canDraw: true,
          joinedAt: new Date(),
        },
      });
      return session;
    });

    return NextResponse.json({ session: created });
  } catch (error) {
    return handleApiError(error);
  }
}
