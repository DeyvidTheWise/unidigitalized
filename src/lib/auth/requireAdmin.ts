import type { UserRole } from "@prisma/client";
import { ApiError } from "../api/errors";

export function requireAdmin(user: { role: UserRole }): void {
  if (user.role !== "ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Admin role required.");
  }
}
