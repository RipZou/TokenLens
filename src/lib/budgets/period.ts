export const BUDGET_TIME_ZONE = "UTC";

// The dashboard polls at least this often, so a new alert shows within two seconds.
export const BUDGET_POLL_MS = 1000;

export type BudgetPeriodName = "day" | "month";

export type PeriodWindow = { start: Date; end: Date };

// A day starts at 00:00 UTC. A month starts at 00:00 UTC on the 1st.
export function periodWindow(now: Date, period: BudgetPeriodName): PeriodWindow {
  if (period === "day") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
