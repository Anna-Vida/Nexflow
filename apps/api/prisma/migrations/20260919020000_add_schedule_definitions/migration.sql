CREATE TABLE "ScheduleDefinition" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "cron" TEXT,
    "timezone" TEXT NOT NULL,
    "intervalMinutes" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScheduleDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledFire" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "bullJobId" TEXT NOT NULL,
    "executionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledFire_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleDefinition_workflowId_nodeId_key" ON "ScheduleDefinition"("workflowId", "nodeId");
CREATE UNIQUE INDEX "ScheduledFire_bullJobId_key" ON "ScheduledFire"("bullJobId");
CREATE UNIQUE INDEX "ScheduledFire_executionId_key" ON "ScheduledFire"("executionId");
CREATE INDEX "ScheduledFire_scheduleId_createdAt_idx" ON "ScheduledFire"("scheduleId", "createdAt");

ALTER TABLE "ScheduleDefinition" ADD CONSTRAINT "ScheduleDefinition_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledFire" ADD CONSTRAINT "ScheduledFire_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledFire" ADD CONSTRAINT "ScheduledFire_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
