-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- Backfill existing rows
UPDATE "User"
SET
  "firstName" = COALESCE("firstName", CASE
    WHEN "role" = 'ADMIN' THEN 'Admin'
    WHEN "role" = 'TUTOR' THEN 'Tutor'
    WHEN "role" = 'STUDENT' THEN 'Student'
    ELSE 'User'
  END),
  "lastName" = COALESCE("lastName", 'Local');

-- Enforce required columns after backfill
ALTER TABLE "User"
ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "lastName" SET NOT NULL;

-- CreateIndex
CREATE INDEX "User_firstName_idx" ON "User"("firstName");

-- CreateIndex
CREATE INDEX "User_lastName_idx" ON "User"("lastName");
