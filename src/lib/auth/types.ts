import type { UserRole } from "@prisma/client";

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_EXISTS"
  | "DEVICE_LIMIT_REACHED"
  | "DEVICE_NOT_VERIFIED"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED";

export class AuthError extends Error {
  status: number;
  code: AuthErrorCode;

  constructor(status: number, code: AuthErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
};
