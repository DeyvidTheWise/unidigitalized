import bcrypt from "bcrypt";
import {
  PrismaClient,
  SessionParticipantRole,
  SessionStatus,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const FIRST_NAMES = [
  "Liam", "Noah", "Oliver", "Elijah", "James", "William", "Benjamin", "Lucas", "Henry", "Alexander",
  "Emma", "Olivia", "Ava", "Sophia", "Isabella", "Mia", "Charlotte", "Amelia", "Harper", "Evelyn",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
];

function pickRandom<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@test.local" },
    update: { passwordHash, role: UserRole.ADMIN, firstName: pickRandom(FIRST_NAMES), lastName: pickRandom(LAST_NAMES) },
    create: {
      email: "admin@test.local",
      firstName: pickRandom(FIRST_NAMES),
      lastName: pickRandom(LAST_NAMES),
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const tutor = await prisma.user.upsert({
    where: { email: "tutor@test.local" },
    update: { passwordHash, role: UserRole.TUTOR, firstName: pickRandom(FIRST_NAMES), lastName: pickRandom(LAST_NAMES) },
    create: {
      email: "tutor@test.local",
      firstName: pickRandom(FIRST_NAMES),
      lastName: pickRandom(LAST_NAMES),
      passwordHash,
      role: UserRole.TUTOR,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@test.local" },
    update: { passwordHash, role: UserRole.STUDENT, firstName: pickRandom(FIRST_NAMES), lastName: pickRandom(LAST_NAMES) },
    create: {
      email: "student@test.local",
      firstName: pickRandom(FIRST_NAMES),
      lastName: pickRandom(LAST_NAMES),
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
