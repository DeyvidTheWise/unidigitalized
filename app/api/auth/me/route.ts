import { NextRequest, NextResponse } from "next/server";
import { handleAuthError } from "@/src/lib/auth/http";
import { requireAuth } from "@/src/lib/auth/requireAuth";
import { withRequestLogging } from "@/src/lib/logging/requestLogger";

export const GET = withRequestLogging("auth_me", async function GET(request: NextRequest) {
  try {
    const { user, device } = await requireAuth(request);
    return NextResponse.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      device: {
        id: device.id,
        verifiedAt: device.verifiedAt,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
});
