import type { BudgetPeriodName } from "@/lib/budgets/period";

export type PriceRecord = {
  model: string;
  inputPerMtok: string;
  outputPerMtok: string;
  cacheReadPerMtok: string;
  cacheWritePerMtok: string;
};

export type BudgetRecord = {
  id: string;
  orgId: string;
  period: BudgetPeriodName;
  limitUsd: string;
};

export type AlertRecord = {
  id: string;
  budgetId: string;
  orgId: string;
  period: BudgetPeriodName;
  level: 80 | 100;
  periodStart: string;
  triggeredAt: string;
  spendUsd: string;
  limitUsd: string;
};

export type NewAlert = {
  budgetId: string;
  level: 80 | 100;
  periodStart: Date;
  triggeredAt: Date;
  spendUsd: string;
  limitUsd: string;
};

export interface BudgetRepository {
  upsertPrice(input: PriceRecord): Promise<PriceRecord>;
  findPrice(model: string): Promise<PriceRecord | null>;
  upsertBudget(input: { orgId: string; period: BudgetPeriodName; limitUsd: string }): Promise<BudgetRecord>;
  listBudgets(orgId: string): Promise<BudgetRecord[]>;
  sumSpend(projectIds: string[], start: Date, end: Date): Promise<string>;
  ensureAlert(input: NewAlert): Promise<void>;
  listAlerts(orgId: string): Promise<AlertRecord[]>;
}
