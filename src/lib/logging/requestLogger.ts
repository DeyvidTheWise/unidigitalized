import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { childLogger } from "./logger";
import { inc, observe } from "../metrics/metrics";
import { toErrorResponse } from "../errors/AppError";

type RouteHandler<TParams = unknown> = (
  request: NextRequest,
  context: TParams,
) => Promise<Response>;

function normalizeRoute(pathname: string): string {
  return pathname.replace(/[0-9a-fA-F-]{8,}/g, ":id");
}

export function withRequestLogging<TParams = unknown>(
  routeId: string,
  handler: RouteHandler<TParams>,
): RouteHandler<TParams> {
  return async (request: NextRequest, context: TParams): Promise<Response> => {
    const requestId = randomUUID();
    const start = performance.now();
    const route = normalizeRoute(request.nextUrl.pathname || routeId);
    const requestLog = childLogger({ requestId, routeId: route });

    try {
      const response = await handler(request, context);
      const durationMs = Number((performance.now() - start).toFixed(2));

      const nextResponse =
        response instanceof NextResponse ? response : new NextResponse(response.body, response);

      nextResponse.headers.set("x-request-id", requestId);

      requestLog.info({
        method: request.method,
        path: request.nextUrl.pathname,
        status: nextResponse.status,
        durationMs,
      }, "http_request");

      inc("http_requests_total", { route, status: String(nextResponse.status) });
      observe("http_request_duration_ms", durationMs, { route });

      return nextResponse;
    } catch (error) {
      const durationMs = Number((performance.now() - start).toFixed(2));
      requestLog.error(
        {
          method: request.method,
          path: request.nextUrl.pathname,
          durationMs,
          err: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        },
        "http_request_failed",
      );
      inc("http_requests_total", { route, status: "500" });
      observe("http_request_duration_ms", durationMs, { route });

      const response = toErrorResponse(error);
      response.headers.set("x-request-id", requestId);
      return response;
    }
  };
}
