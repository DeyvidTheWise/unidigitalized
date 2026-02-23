import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { withRequestLogging } from "@/src/lib/logging/requestLogger";

export const GET = withRequestLogging("health", async function GET() {
  let db: "ok" | "fail" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "fail";
  }

  return NextResponse.json({
    ok: db === "ok",
    time: new Date().toISOString(),
    db,
    version: process.env.GIT_SHA ?? "unknown",
  });
});
