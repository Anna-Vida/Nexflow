CREATE TABLE "HttpAction" (
    "id" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "nodeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" JSONB,
    "message" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "HttpAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HttpActionAttempt" (
    "id" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    CONSTRAINT "HttpActionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HttpAction_executionId_nodeId_key" ON "HttpAction"("executionId", "nodeId");
CREATE UNIQUE INDEX "HttpAction_idempotencyKey_key" ON "HttpAction"("idempotencyKey");
CREATE INDEX "HttpAction_status_updatedAt_idx" ON "HttpAction"("status", "updatedAt");
CREATE UNIQUE INDEX "HttpActionAttempt_actionId_number_key" ON "HttpActionAttempt"("actionId", "number");

ALTER TABLE "HttpAction" ADD CONSTRAINT "HttpAction_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HttpActionAttempt" ADD CONSTRAINT "HttpActionAttempt_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "HttpAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
