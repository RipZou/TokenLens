import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { formatUsd, parseUsd } from "@/lib/budgets/money";
import { getPrisma } from "@/lib/db/prisma";
import type {
  AlertRecord,
  BudgetRecord,
  BudgetRepository,
  NewAlert,
  PriceRecord,
} from "@/lib/services/budget-repository";

function storedUsd(value: { toFixed(digits: number): string }): string {
  const parsed = parseUsd(value.toFixed(8));
  if (parsed === null) throw new Error("Stored amount is not a valid USD value");
  return formatUsd(parsed);
}

export class PrismaBudgetRepository implements BudgetRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsertPrice(input: PriceRecord): Promise<PriceRecord> {
    const row = await this.db.modelPrice.upsert({
      where: { model: input.model },
      create: input,
      update: {
        inputPerMtok: input.inputPerMtok,
        outputPerMtok: input.outputPerMtok,
        cacheReadPerMtok: input.cacheReadPerMtok,
        cacheWritePerMtok: input.cacheWritePerMtok,
      },
    });
    return {
      model: row.model,
      inputPerMtok: storedUsd(row.inputPerMtok),
      outputPerMtok: storedUsd(row.outputPerMtok),
      cacheReadPerMtok: storedUsd(row.cacheReadPerMtok),
      cacheWritePerMtok: storedUsd(row.cacheWritePerMtok),
    };
  }

  async findPrice(model: string): Promise<PriceRecord | null> {
    const row = await this.db.modelPrice.findUnique({ where: { model } });
    if (!row) return null;
    return {
      model: row.model,
      inputPerMtok: storedUsd(row.inputPerMtok),
      outputPerMtok: storedUsd(row.outputPerMtok),
      cacheReadPerMtok: storedUsd(row.cacheReadPerMtok),
      cacheWritePerMtok: storedUsd(row.cacheWritePerMtok),
    };
  }

  async upsertBudget(input: { orgId: string; period: BudgetRecord["period"]; limitUsd: string }): Promise<BudgetRecord> {
    const row = await this.db.budget.upsert({
      where: { orgId_period: { orgId: input.orgId, period: input.period } },
      create: input,
      update: { limitUsd: input.limitUsd },
    });
    return { id: row.id, orgId: row.orgId, period: row.period, limitUsd: storedUsd(row.limitUsd) };
  }

  async listBudgets(orgId: string): Promise<BudgetRecord[]> {
    const rows = await this.db.budget.findMany({ where: { orgId } });
    return rows.map((row) => ({ id: row.id, orgId: row.orgId, period: row.period, limitUsd: storedUsd(row.limitUsd) }));
  }

  async sumSpend(projectIds: string[], start: Date, end: Date): Promise<string> {
    if (projectIds.length === 0) return formatUsd(0n);
    const sum = await this.db.event.aggregate({
      where: { projectId: { in: projectIds }, createdAt: { gte: start, lt: end }, costUsd: { not: null } },
      _sum: { costUsd: true },
    });
    return sum._sum.costUsd === null ? formatUsd(0n) : storedUsd(sum._sum.costUsd);
  }

  async ensureAlert(input: NewAlert): Promise<void> {
    try {
      await this.db.alert.create({ data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
      throw error;
    }
  }

  async listAlerts(orgId: string): Promise<AlertRecord[]> {
    const rows = await this.db.alert.findMany({
      where: { budget: { orgId } },
      include: { budget: true },
      orderBy: [{ triggeredAt: "desc" }, { level: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      budgetId: row.budgetId,
      orgId: row.budget.orgId,
      period: row.budget.period,
      level: row.level === 100 ? 100 : 80,
      periodStart: row.periodStart.toISOString(),
      triggeredAt: row.triggeredAt.toISOString(),
      spendUsd: storedUsd(row.spendUsd),
      limitUsd: storedUsd(row.limitUsd),
    }));
  }
}

export function getBudgetRepository(): BudgetRepository {
  return new PrismaBudgetRepository(getPrisma());
}
