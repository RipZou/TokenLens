-- CreateEnum
CREATE TYPE "budget_period" AS ENUM ('day', 'month');

-- CreateTable
CREATE TABLE "model_prices" (
    "model" TEXT NOT NULL,
    "input_per_mtok" DECIMAL(18,8) NOT NULL,
    "output_per_mtok" DECIMAL(18,8) NOT NULL,
    "cache_read_per_mtok" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "cache_write_per_mtok" DECIMAL(18,8) NOT NULL DEFAULT 0,

    CONSTRAINT "model_prices_pkey" PRIMARY KEY ("model")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "period" "budget_period" NOT NULL,
    "limit_usd" DECIMAL(18,8) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "spend_usd" DECIMAL(18,8) NOT NULL,
    "limit_usd" DECIMAL(18,8) NOT NULL,
    "triggered_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budgets_org_id_period_key" ON "budgets"("org_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_budget_id_period_start_level_key" ON "alerts"("budget_id", "period_start", "level");

-- CreateIndex
CREATE INDEX "alerts_triggered_at_idx" ON "alerts"("triggered_at");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
