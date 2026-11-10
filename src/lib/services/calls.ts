import { INPUT_CATEGORIES, type InputCategory } from "@/lib/classifier/types";
import type { EventRepository, StoredEvent } from "@/lib/services/event-repository";
import type { OrganizationRepository } from "@/lib/services/organization-repository";
import type { ProjectRepository } from "@/lib/services/project-repository";

export type CallDependencies = {
  orgs: OrganizationRepository;
  projects: ProjectRepository;
  events: EventRepository;
};

export const TIME_RANGES = ["24h", "7d", "30d"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export type DashboardQuery = {
  projectId?: string;
  agent?: string;
  model?: string;
  range?: string;
};

export type CategoryTotal = { category: InputCategory; tokens: number };

export type CallListItem = {
  id: string;
  projectId: string;
  agentName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  largestCategory: InputCategory;
  estimated: boolean;
  createdAt: string;
  costUsd: null;
};

export type ChartBucket = { label: string; totals: CategoryTotal[] };

export type DashboardData = {
  projects: { id: string; name: string }[];
  projectId: string | null;
  agents: string[];
  models: string[];
  agent: string | null;
  model: string | null;
  range: TimeRange;
  calls: CallListItem[];
  totals: { inputTokens: number; outputTokens: number; calls: number; costUsd: null };
  buckets: ChartBucket[];
  today: CategoryTotal[];
};

export type LoadedDashboard = { status: 403 } | { status: 200; dashboard: DashboardData };

export type CallDetail = CallListItem & {
  externalId: string;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  input: { category: InputCategory; tokens: number; share: number }[];
  output: { text: number; thinking: number; tool_use: number };
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function parseRange(value: string | undefined): TimeRange {
  return TIME_RANGES.find((range) => range === value) ?? "7d";
}

export function rangeStart(range: TimeRange, now: Date): Date {
  if (range === "24h") {
    const start = new Date(now);
    start.setUTCMinutes(0, 0, 0);
    start.setUTCHours(start.getUTCHours() - 23);
    return start;
  }
  const days = range === "7d" ? 6 : 29;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
}

function blankTotals(): CategoryTotal[] {
  return INPUT_CATEGORIES.map((category) => ({ category, tokens: 0 }));
}

function inputTotals(event: StoredEvent): CategoryTotal[] {
  return INPUT_CATEGORIES.map((category) => ({
    category,
    tokens: event.breakdowns.find((row) => row.direction === "input" && row.category === category)?.tokens ?? 0,
  }));
}

function largestCategory(totals: CategoryTotal[]): InputCategory {
  return totals.reduce((best, item) => (item.tokens > best.tokens ? item : best)).category;
}

export function summarizeCall(event: StoredEvent): CallListItem {
  return {
    id: event.id,
    projectId: event.projectId,
    agentName: event.agentName,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    largestCategory: largestCategory(inputTotals(event)),
    estimated: event.estimated,
    createdAt: event.createdAt.toISOString(),
    costUsd: null,
  };
}

function outputTokens(event: StoredEvent, category: "text" | "thinking" | "tool_use"): number {
  return event.breakdowns.find((row) => row.direction === "output" && row.category === category)?.tokens ?? 0;
}

function bucketCount(range: TimeRange): number {
  if (range === "24h") return 24;
  if (range === "7d") return 7;
  return 30;
}

function addStep(start: Date, range: TimeRange, steps: number): Date {
  const next = new Date(start);
  if (range === "24h") next.setUTCHours(next.getUTCHours() + steps);
  else next.setUTCDate(next.getUTCDate() + steps);
  return next;
}

function bucketLabel(start: Date, range: TimeRange): string {
  if (range === "24h") return `${String(start.getUTCHours()).padStart(2, "0")}:00`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start);
}

function buildBuckets(events: StoredEvent[], range: TimeRange, now: Date): ChartBucket[] {
  const start = rangeStart(range, now);
  const step = range === "24h" ? HOUR_MS : DAY_MS;
  const buckets = Array.from({ length: bucketCount(range) }, (_, index) => ({
    label: bucketLabel(addStep(start, range, index), range),
    totals: blankTotals(),
  }));
  for (const event of events) {
    const index = Math.floor((event.createdAt.getTime() - start.getTime()) / step);
    const bucket = buckets[index];
    if (!bucket) continue;
    for (const item of inputTotals(event)) {
      const total = bucket.totals.find((entry) => entry.category === item.category);
      if (total) total.tokens += item.tokens;
    }
  }
  return buckets;
}

function sumCategories(events: StoredEvent[]): CategoryTotal[] {
  const totals = blankTotals();
  for (const event of events) {
    for (const item of inputTotals(event)) {
      const total = totals.find((entry) => entry.category === item.category);
      if (total) total.tokens += item.tokens;
    }
  }
  return totals;
}

export async function readableProjects(userId: string, deps: CallDependencies): Promise<{ id: string; name: string }[]> {
  const memberships = await deps.orgs.listForUser(userId);
  const grouped = await Promise.all(memberships.map((membership) => deps.projects.listByOrg(membership.id)));
  return grouped.flat().map(({ id, name }) => ({ id, name }));
}

export async function loadDashboard(
  userId: string,
  query: DashboardQuery,
  now: Date,
  deps: CallDependencies,
): Promise<LoadedDashboard> {
  const projects = await readableProjects(userId, deps);
  const requested = query.projectId?.trim() || null;
  if (requested && !projects.some((project) => project.id === requested)) return { status: 403 };
  const projectIds = requested ? [requested] : projects.map((project) => project.id);
  const range = parseRange(query.range);
  const events =
    projectIds.length === 0
      ? []
      : (await deps.events.listInRange(projectIds, rangeStart(range, now))).sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
        );
  const agent = query.agent?.trim() || null;
  const model = query.model?.trim() || null;
  const filtered = events.filter((event) => (agent === null || event.agentName === agent) && (model === null || event.model === model));
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    status: 200,
    dashboard: {
      projects,
      projectId: requested,
      agents: [...new Set(events.map((event) => event.agentName))].sort(),
      models: [...new Set(events.map((event) => event.model))].sort(),
      agent,
      model,
      range,
      calls: filtered.map(summarizeCall),
      totals: {
        inputTokens: filtered.reduce((sum, event) => sum + event.inputTokens, 0),
        outputTokens: filtered.reduce((sum, event) => sum + event.outputTokens, 0),
        calls: filtered.length,
        costUsd: null,
      },
      buckets: buildBuckets(filtered, range, now),
      today: sumCategories(filtered.filter((event) => event.createdAt.getTime() >= todayStart.getTime())),
    },
  };
}

export async function loadCallDetail(
  userId: string,
  projectId: string,
  eventId: string,
  deps: CallDependencies,
): Promise<CallDetail | null> {
  const projects = await readableProjects(userId, deps);
  if (!projects.some((project) => project.id === projectId)) return null;
  const event = await deps.events.findInProjects(eventId, [projectId]);
  if (!event) return null;
  const totals = inputTotals(event);
  return {
    ...summarizeCall(event),
    externalId: event.externalId,
    cacheReadTokens: event.cacheReadTokens,
    cacheWriteTokens: event.cacheWriteTokens,
    input: totals.map((item) => ({
      ...item,
      share: event.inputTokens === 0 ? 0 : item.tokens / event.inputTokens,
    })),
    output: {
      text: outputTokens(event, "text"),
      thinking: outputTokens(event, "thinking"),
      tool_use: outputTokens(event, "tool_use"),
    },
  };
}
