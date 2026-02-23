-- CreateTable
CREATE TABLE "SessionSequence" (
    "sessionId" UUID NOT NULL,
    "nextSeq" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "SessionSequence_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "SessionSequence" ADD CONSTRAINT "SessionSequence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
