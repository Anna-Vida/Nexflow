-- Existing local data remains under a disabled legacy account until the first
-- real signup atomically adopts it. The fixed ID is never an authentication token.
INSERT INTO "User" ("id", "email", "passwordHash")
VALUES ('00000000-0000-4000-8000-000000000001', 'legacy@nexflow.invalid', 'disabled')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "Workflow" ADD COLUMN "ownerId" UUID;
UPDATE "Workflow" SET "ownerId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Workflow" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Workflow_ownerId_updatedAt_idx" ON "Workflow"("ownerId", "updatedAt");

ALTER TABLE "Execution" ADD COLUMN "ownerId" UUID;
UPDATE "Execution" SET "ownerId" = COALESCE(
  (SELECT "ownerId" FROM "Workflow" WHERE "Workflow"."id" = "Execution"."workflowId"),
  '00000000-0000-4000-8000-000000000001'
);
ALTER TABLE "Execution" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Execution_ownerId_startedAt_idx" ON "Execution"("ownerId", "startedAt");
