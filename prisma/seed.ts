import bcrypt from "bcrypt";
import {
  PrismaClient,
  SessionParticipantRole,
  SessionStatus,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@test.local" },
    update: { passwordHash, role: UserRole.ADMIN },
    create: {
      email: "admin@test.local",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const tutor = await prisma.user.upsert({
    where: { email: "tutor@test.local" },
    update: { passwordHash, role: UserRole.TUTOR },
    create: {
      email: "tutor@test.local",
      passwordHash,
      role: UserRole.TUTOR,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@test.local" },
    update: { passwordHash, role: UserRole.STUDENT },
    create: {
      email: "student@test.local",
      passwordHash,
      role: UserRole.STUDENT,
    },
  });

  const existingSession = await prisma.session.findFirst({
    where: {
      title: "Seeded Scheduled Session",
      createdByUserId: tutor.id,
      status: SessionStatus.SCHEDULED,
    },
  });

  const session =
    existingSession ??
    (await prisma.session.create({
      data: {
        title: "Seeded Scheduled Session",
        scheduledStartAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: SessionStatus.SCHEDULED,
        createdByUserId: tutor.id,
      },
    }));

  await prisma.sessionParticipant.upsert({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: tutor.id,
      },
    },
    update: {
      roleInSession: SessionParticipantRole.TUTOR,
      canDraw: true,
    },
    create: {
      sessionId: session.id,
      userId: tutor.id,
      roleInSession: SessionParticipantRole.TUTOR,
      canDraw: true,
    },
  });

  await prisma.sessionParticipant.upsert({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: student.id,
      },
    },
    update: {
      roleInSession: SessionParticipantRole.STUDENT,
      canDraw: false,
    },
    create: {
      sessionId: session.id,
      userId: student.id,
      roleInSession: SessionParticipantRole.STUDENT,
      canDraw: false,
    },
  });

  console.log("Seed complete", {
    adminId: admin.id,
    tutorId: tutor.id,
    studentId: student.id,
    sessionId: session.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
