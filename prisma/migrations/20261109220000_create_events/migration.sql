-- CreateEnum
CREATE TYPE "breakdown_direction" AS ENUM ('input', 'output');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_read_tokens" INTEGER NOT NULL,
    "cache_write_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(18,8),
    "estimated" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_breakdowns" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "direction" "breakdown_direction" NOT NULL,
    "category" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(18,8),

    CONSTRAINT "event_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_project_id_external_id_key" ON "events"("project_id", "external_id");

-- CreateIndex
CREATE INDEX "events_project_id_created_at_idx" ON "events"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "event_breakdowns_event_id_idx" ON "event_breakdowns"("event_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_breakdowns" ADD CONSTRAINT "event_breakdowns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
