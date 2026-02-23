import { NextResponse } from "next/server";
import { AuthError } from "./types";

export function jsonError(status: number, code: string, message: string): NextResponse {
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

export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return jsonError(error.status, error.code, error.message);
  }

  return jsonError(500, "TOKEN_INVALID", "Unexpected server error.");
}
