import { NextResponse } from "next/server";

export type ErrorCode = string;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly meta?: Record<string, unknown>;

  constructor(status: number, code: ErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.meta = meta;
  }
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
      },
    },
    { status: 500 },
  );
}
