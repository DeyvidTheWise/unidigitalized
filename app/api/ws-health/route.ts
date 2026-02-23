import { NextResponse } from "next/server";
import { withRequestLogging } from "@/src/lib/logging/requestLogger";

const WS_HEALTH_URL = process.env.WS_HEALTH_URL ?? "http://127.0.0.1:3002/health";

export const GET = withRequestLogging("ws_health", async function GET() {
  try {
    const response = await fetch(WS_HEALTH_URL, {
      signal: AbortSignal.timeout(1_500),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          ws: "fail",
          upstreamStatus: response.status,
        },
        { status: 503 },
      );
    }

    const payload = await response.json();
    return NextResponse.json({
      ok: true,
      ws: "ok",
      upstream: payload,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        ws: "fail",
      },
      { status: 503 },
    );
  }
});
