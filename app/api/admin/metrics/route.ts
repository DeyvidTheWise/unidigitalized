import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { snapshot } from "@/src/lib/metrics/metrics";
import { jsonApiError } from "@/src/lib/api/errors";
import { handleAuthError } from "@/src/lib/auth/http";
import { withRequestLogging } from "@/src/lib/logging/requestLogger";

export const GET = withRequestLogging("admin_metrics", async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    if (user.role !== "ADMIN") {
      return jsonApiError(403, "FORBIDDEN", "Admin role required.");
    }

    return NextResponse.json(snapshot());
  } catch (error) {
    return handleAuthError(error);
  }
});
