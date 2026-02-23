import { NextRequest, NextResponse } from "next/server";
import { SessionStatus } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { prisma } from "@/src/lib/prisma";
import { deleteSessionCascade } from "@/src/lib/admin/service";
import { handleApiError } from "@/src/lib/api/errors";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    requireAdmin(user);
    const { id } = await context.params;
    const body = await request.json();

    const data: {
      title?: string;
      scheduledStartAt?: Date;
      status?: SessionStatus;
      actualStartAt?: Date | null;
      endedAt?: Date | null;
    } = {};

    if (typeof body?.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body?.scheduledStartAt === "string") {
      const date = new Date(body.scheduledStartAt);
      if (!Number.isNaN(date.getTime())) {
        data.scheduledStartAt = date;
      }
    }
    if (body?.status && Object.values(SessionStatus).includes(body.status)) {
      data.status = body.status;
      if (body.status === "ACTIVE" && !body.actualStartAt) {
        data.actualStartAt = new Date();
        data.endedAt = null;
      }
      if (body.status === "ENDED" && !body.endedAt) {
        data.endedAt = new Date();
      }
      if (body.status === "SCHEDULED") {
        data.actualStartAt = null;
        data.endedAt = null;
      }
    }

    const session = await prisma.session.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStartAt: true,
        actualStartAt: true,
        endedAt: true,
        createdByUserId: true,
      },
    });
    return NextResponse.json({ session });
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
    await deleteSessionCascade(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
