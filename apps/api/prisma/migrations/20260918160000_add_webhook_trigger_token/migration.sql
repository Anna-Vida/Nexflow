ALTER TABLE "Workflow"
ADD COLUMN "webhookToken" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "Workflow_webhookToken_key"
ON "Workflow"("webhookToken");
