ALTER TABLE "Execution"
ADD COLUMN "workerLeaseId" TEXT,
ADD COLUMN "workerHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "recoveryCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Execution_status_workerHeartbeatAt_idx" ON "Execution"("status", "workerHeartbeatAt");
