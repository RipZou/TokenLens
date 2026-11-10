import { z } from "zod";
import { crossedLevels, formatUsd, parseUsd, type TokenPrice } from "@/lib/budgets/money";
import { BUDGET_POLL_MS, BUDGET_TIME_ZONE, periodWindow, type BudgetPeriodName } from "@/lib/budgets/period";
import { authorize } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import type { BudgetRepository, PriceRecord } from "@/lib/services/budget-repository";
import type { OrganizationRepository } from "@/lib/services/organization-repository";
import type { ProjectRepository } from "@/lib/services/project-repository";

export { BUDGET_POLL_MS, BUDGET_TIME_ZONE };

const usd = z.string().regex(/^\d+(\.\d{1,8})?$/);

const budgetSchema = z.object({
  period: z.enum(["day", "month"]),
  limitUsd: usd,
});

const priceSchema = z.object({
  model: z.string().trim().min(1).max(200),
  inputPerMtok: usd,
  outputPerMtok: usd,
  cacheReadPerMtok: usd.optional(),
  cacheWritePerMtok: usd.optional(),
});

export type BudgetDependencies = {
  orgs: OrganizationRepository;
  projects: ProjectRepository;
  budgets: BudgetRepository;
  secret: string;
};

export async function handlePutBudget(
  request: Request,
  orgId: string,
  deps: BudgetDependencies,
): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const role = await deps.orgs.findRole(orgId, user.sub);
  const denied = authorize(role, "configureBudgets");
  if (denied) return denied;

  const input = await readJson(request, budgetSchema);
  if (input instanceof Response) return input;
  const limit = parseUsd(input.limitUsd);
  if (limit === null || limit <= 0n) return errorResponse(400, "Invalid request body");

  const budget = await deps.budgets.upsertBudget({
    orgId,
    period: input.period,
    limitUsd: formatUsd(limit),
  });
  return Response.json(budget);
}

export async function handleGetBudgets(
  request: Request,
  orgId: string,
  deps: BudgetDependencies,
  now = new Date(),
): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const role = await deps.orgs.findRole(orgId, user.sub);
  const denied = authorize(role, "readOrganization");
  if (denied) return denied;

  await recordBudgetAlerts(orgId, now, deps);
  const day = periodWindow(now, "day");
  const month = periodWindow(now, "month");
  const budgets = await snapshotBudgets(orgId, now, deps);
  const alerts = await deps.budgets.listAlerts(orgId);
  return Response.json({
    timeZone: BUDGET_TIME_ZONE,
    day: { start: day.start.toISOString(), end: day.end.toISOString() },
    month: { start: month.start.toISOString(), end: month.end.toISOString() },
    budgets,
    alerts,
  });
}

export async function handlePutModelPrice(request: Request, deps: BudgetDependencies): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const memberships = await deps.orgs.listForUser(user.sub);
  if (!memberships.some((membership) => membership.role === "ADMIN")) {
    return errorResponse(403, "Forbidden");
  }

  const input = await readJson(request, priceSchema);
  if (input instanceof Response) return input;
  const price = await deps.budgets.upsertPrice({
    model: input.model,
    inputPerMtok: formatUsd(parseUsd(input.inputPerMtok) ?? 0n),
    outputPerMtok: formatUsd(parseUsd(input.outputPerMtok) ?? 0n),
    cacheReadPerMtok: formatUsd(parseUsd(input.cacheReadPerMtok ?? "0") ?? 0n),
    cacheWritePerMtok: formatUsd(parseUsd(input.cacheWritePerMtok ?? "0") ?? 0n),
  });
  return Response.json(price);
}

export async function priceForEvent(model: string, budgets: BudgetRepository): Promise<TokenPrice | null> {
  const price = await budgets.findPrice(model);
  if (!price) return null;
  return toTokenPrice(price);
}

export async function recordBudgetAlerts(
  orgId: string,
  now: Date,
  deps: Pick<BudgetDependencies, "projects" | "budgets">,
): Promise<void> {
  const projectIds = (await deps.projects.listByOrg(orgId)).map((project) => project.id);
  const budgets = await deps.budgets.listBudgets(orgId);
  for (const budget of budgets) {
    const window = periodWindow(now, budget.period);
    const spendUsd = await deps.budgets.sumSpend(projectIds, window.start, window.end);
    const spend = parseUsd(spendUsd) ?? 0n;
    const limit = parseUsd(budget.limitUsd) ?? 0n;
    for (const level of crossedLevels(spend, limit)) {
      await deps.budgets.ensureAlert({
        budgetId: budget.id,
        level,
        periodStart: window.start,
        triggeredAt: now,
        spendUsd,
        limitUsd: budget.limitUsd,
      });
    }
  }
}

async function snapshotBudgets(orgId: string, now: Date, deps: Pick<BudgetDependencies, "projects" | "budgets">) {
  const projectIds = (await deps.projects.listByOrg(orgId)).map((project) => project.id);
  const budgets = await deps.budgets.listBudgets(orgId);
  const ordered = [...budgets].sort((left, right) => periodOrder(left.period) - periodOrder(right.period));
  return Promise.all(
    ordered.map(async (budget) => {
      const window = periodWindow(now, budget.period);
      const spendUsd = await deps.budgets.sumSpend(projectIds, window.start, window.end);
      return { period: budget.period, limitUsd: budget.limitUsd, spendUsd };
    }),
  );
}

function periodOrder(period: BudgetPeriodName): number {
  return period === "day" ? 0 : 1;
}

function toTokenPrice(price: PriceRecord): TokenPrice {
  return {
    inputPerMtok: parseUsd(price.inputPerMtok) ?? 0n,
    outputPerMtok: parseUsd(price.outputPerMtok) ?? 0n,
    cacheReadPerMtok: parseUsd(price.cacheReadPerMtok) ?? 0n,
    cacheWritePerMtok: parseUsd(price.cacheWritePerMtok) ?? 0n,
  };
}

export type { TokenPrice };
