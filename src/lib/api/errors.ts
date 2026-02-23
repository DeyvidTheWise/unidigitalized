import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "SESSION_ENDED"
  | "SESSION_NOT_ENDED"
  | "INVALID_STATE_TRANSITION"
  | "ALREADY_PARTICIPANT"
  | "EXPORT_EXPIRED"
  | "NEED_SNAPSHOT"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonApiError(status: number, code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return jsonApiError(error.status, error.code, error.message);
  }

  return jsonApiError(500, "INTERNAL_ERROR", "Unexpected server error.");
}
