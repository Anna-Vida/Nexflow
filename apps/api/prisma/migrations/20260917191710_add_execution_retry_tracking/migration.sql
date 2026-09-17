-- AlterTable
ALTER TABLE "Execution" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "retriedFromId" UUID,
ADD COLUMN     "startNodeId" TEXT;

-- AlterTable
ALTER TABLE "ExecutionEvent" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_retriedFromId_fkey" FOREIGN KEY ("retriedFromId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
