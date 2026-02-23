import { NextRequest, NextResponse } from "next/server";
import { Prisma, SessionStatus } from "@prisma/client";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { requireTutorOrAdmin } from "@/src/lib/auth/requireRole";
import { handleApiError, ApiError, jsonApiError } from "@/src/lib/api/errors";
import { prisma } from "@/src/lib/prisma";

const SCHEDULE_TOLERANCE_MS = 5 * 60 * 1000;

function parseDateOrThrow(value: unknown, field: string): Date {
  if (typeof value !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be an ISO date string.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid ISO date.`);
  }
  return date;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    requireTutorOrAdmin(user);

    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) {
      return jsonApiError(400, "VALIDATION_ERROR", "title is required.");
    }

    const scheduledStartAt = parseDateOrThrow(body?.scheduledStartAt, "scheduledStartAt");
    if (scheduledStartAt.getTime() < Date.now() - SCHEDULE_TOLERANCE_MS) {
      return jsonApiError(400, "VALIDATION_ERROR", "scheduledStartAt cannot be in the past.");
    }

    const participantUserIdsRaw: unknown[] = Array.isArray(body?.participantUserIds) ? body.participantUserIds : [];
    const participantUserIdsFiltered: string[] = participantUserIdsRaw.filter(
      (id: unknown): id is string => typeof id === "string",
    );
    const participantUserIds: string[] = [...new Set(participantUserIdsFiltered)].filter(
      (id) => id !== user.id,
    );

    if (participantUserIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: participantUserIds } },
        select: { id: true },
      });

      if (users.length !== participantUserIds.length) {
        return jsonApiError(400, "VALIDATION_ERROR", "One or more participantUserIds do not exist.");
      }
    }

    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          title,
          scheduledStartAt,
          status: SessionStatus.SCHEDULED,
          createdByUserId: user.id,
        },
      });

      await tx.sessionParticipant.create({
        data: {
          sessionId: created.id,
          userId: user.id,
          roleInSession: "TUTOR",
          canDraw: true,
          joinedAt: new Date(),
        },
      });

      if (participantUserIds.length > 0) {
        await tx.sessionParticipant.createMany({
          data: participantUserIds.map((participantUserId) => ({
            sessionId: created.id,
            userId: participantUserId,
            roleInSession: "STUDENT" as const,
            canDraw: false,
          })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "SESSION_CREATE",
          targetType: "SESSION",
          targetId: created.id,
          ip: request.headers.get("x-forwarded-for") ?? null,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      });

      return created;
    });

    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonApiError(409, "ALREADY_PARTICIPANT", "Participant is already enrolled.");
    }
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const statusParam = request.nextUrl.searchParams.get("status");
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");

    let statusFilter: SessionStatus | undefined;
    if (statusParam) {
      if (statusParam !== "SCHEDULED" && statusParam !== "ACTIVE" && statusParam !== "ENDED") {
        return jsonApiError(400, "VALIDATION_ERROR", "Invalid status filter.");
      }
      statusFilter = statusParam;
    }

    const scheduledStartAt: { gte?: Date; lte?: Date } = {};
    if (fromParam) {
      const from = new Date(fromParam);
      if (Number.isNaN(from.getTime())) {
        return jsonApiError(400, "VALIDATION_ERROR", "Invalid from date.");
      }
      scheduledStartAt.gte = from;
    }
    if (toParam) {
      const to = new Date(toParam);
      if (Number.isNaN(to.getTime())) {
        return jsonApiError(400, "VALIDATION_ERROR", "Invalid to date.");
      }
      scheduledStartAt.lte = to;
    }

    const accessWhere =
      user.role === "STUDENT"
        ? {
            participants: {
              some: {
                userId: user.id,
                leftAt: null,
              },
            },
          }
        : {
            OR: [
              { createdByUserId: user.id },
              {
                participants: {
                  some: {
                    userId: user.id,
                    leftAt: null,
                  },
                },
              },
            ],
          };

    const sessions = await prisma.session.findMany({
      where: {
        ...accessWhere,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(Object.keys(scheduledStartAt).length > 0 ? { scheduledStartAt } : {}),
      },
      orderBy: [{ scheduledStartAt: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}
