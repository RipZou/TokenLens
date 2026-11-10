import { randomUUID } from "node:crypto";
import { formatUsd, parseUsd } from "@/lib/budgets/money";
import type { MemoryEventRepository } from "@/lib/services/memory-event-repository";
import type {
  AlertRecord,
  BudgetRecord,
  BudgetRepository,
  NewAlert,
  PriceRecord,
} from "@/lib/services/budget-repository";

export class MemoryBudgetRepository implements BudgetRepository {
  private readonly prices = new Map<string, PriceRecord>();
  private readonly budgets: BudgetRecord[] = [];
  private readonly alerts: AlertRecord[] = [];

  constructor(private readonly events: MemoryEventRepository) {}

  async upsertPrice(input: PriceRecord): Promise<PriceRecord> {
    this.prices.set(input.model, { ...input });
    return { ...input };
  }

  async findPrice(model: string): Promise<PriceRecord | null> {
    const price = this.prices.get(model);
    return price ? { ...price } : null;
  }

  async upsertBudget(input: { orgId: string; period: BudgetRecord["period"]; limitUsd: string }): Promise<BudgetRecord> {
    const existing = this.budgets.find((budget) => budget.orgId === input.orgId && budget.period === input.period);
    if (existing) {
      existing.limitUsd = input.limitUsd;
      return { ...existing };
    }
    const created = { id: randomUUID(), ...input };
    this.budgets.push(created);
    return { ...created };
  }

  async listBudgets(orgId: string): Promise<BudgetRecord[]> {
    return this.budgets.filter((budget) => budget.orgId === orgId).map((budget) => ({ ...budget }));
  }

  async sumSpend(projectIds: string[], start: Date, end: Date): Promise<string> {
    const ids = new Set(projectIds);
    let total = 0n;
    for (const event of this.events.saved()) {
      if (!ids.has(event.projectId) || !event.costUsd) continue;
      if (event.createdAt < start || event.createdAt >= end) continue;
      total += parseUsd(event.costUsd) ?? 0n;
    }
    return formatUsd(total);
  }

  async ensureAlert(input: NewAlert): Promise<void> {
    const periodStart = input.periodStart.toISOString();
    const exists = this.alerts.some(
      (alert) => alert.budgetId === input.budgetId && alert.periodStart === periodStart && alert.level === input.level,
    );
    if (exists) return;
    const budget = this.budgets.find((item) => item.id === input.budgetId);
    if (!budget) return;
    this.alerts.push({
      id: randomUUID(),
      budgetId: input.budgetId,
      orgId: budget.orgId,
      period: budget.period,
      level: input.level,
      periodStart,
      triggeredAt: input.triggeredAt.toISOString(),
      spendUsd: input.spendUsd,
      limitUsd: input.limitUsd,
    });
  }

  async listAlerts(orgId: string): Promise<AlertRecord[]> {
    return this.alerts
      .filter((alert) => alert.orgId === orgId)
      .map((alert) => ({ ...alert }))
      .sort((left, right) => right.triggeredAt.localeCompare(left.triggeredAt) || right.level - left.level);
  }
}
