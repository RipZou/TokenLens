import { describe, expect, it } from "vitest";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import { INPUT_CATEGORIES } from "@/lib/classifier/types";
import { MemoryOrganizationRepository } from "@/lib/services/memory-organization-repository";
import { MemoryProjectRepository } from "@/lib/services/memory-project-repository";
import { MemoryEventRepository } from "@/lib/services/memory-event-repository";
import { loadCallDetail, loadDashboard, type CallDependencies } from "@/lib/services/calls";
import type { BreakdownRow } from "@/lib/services/event-repository";

const NOW = new Date("2026-11-10T18:30:00.000Z");

function rows(
  input: Partial<Record<(typeof INPUT_CATEGORIES)[number], number>>,
  output: Partial<Record<"text" | "thinking" | "tool_use", number>> = {},
): BreakdownRow[] {
  return [
    ...INPUT_CATEGORIES.map((category) => ({ direction: "input" as const, category, tokens: input[category] ?? 0 })),
    ...(["text", "thinking", "tool_use"] as const).map((category) => ({
      direction: "output" as const,
      category,
      tokens: output[category] ?? 0,
    })),
  ];
}

async function setup() {
  const users = new MemoryUserRepository();
  const orgs = new MemoryOrganizationRepository();
  const projects = new MemoryProjectRepository();
  const events = new MemoryEventRepository();
  const admin = await users.create({ email: "admin@example.com", passwordHash: "$2b$12$hash" });
  const outsider = await users.create({ email: "outsider@example.com", passwordHash: "$2b$12$hash" });
  const org = await orgs.createWithAdmin("Acme AI", { id: admin.id, email: admin.email });
  const project = await projects.create({ orgId: org.id, name: "Support", createdBy: admin.id });
  const deps: CallDependencies = { orgs, projects, events };
  return { admin, outsider, project, events, deps };
}

describe("dashboard calls", () => {
  it("lists the newest matching call first and totals the selected range", async () => {
    const { admin, project, events, deps } = await setup();
    await events.create({
      externalId: "older",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 9,
      outputTokens: 2,
      cacheReadTokens: 1,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: null,
      createdAt: new Date("2026-11-09T12:00:00.000Z"),
      breakdowns: rows({ system: 5, user_input: 4 }, { text: 2 }),
    });
    const newest = await events.create({
      externalId: "newer",
      projectId: project.id,
      agentName: "triage-bot",
      model: "claude-haiku-4-5",
      inputTokens: 4,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: true,
      costUsd: null,
      createdAt: new Date("2026-11-10T18:00:00.000Z"),
      breakdowns: rows({ history: 4 }, { tool_use: 1 }),
    });

    const loaded = await loadDashboard(admin.id, { projectId: project.id, range: "7d" }, NOW, deps);

    expect(loaded.status).toBe(200);
    if (loaded.status !== 200) return;
    expect(loaded.dashboard.calls.map((call) => call.id)).toEqual([newest.id, expect.any(String)]);
    expect(loaded.dashboard.calls[0]).toMatchObject({
      agentName: "triage-bot",
      model: "claude-haiku-4-5",
      largestCategory: "history",
      estimated: true,
      costUsd: null,
    });
    expect(loaded.dashboard.totals).toEqual({ inputTokens: 13, outputTokens: 3, calls: 2, costUsd: null });
    expect(loaded.dashboard.buckets).toHaveLength(7);
    expect(loaded.dashboard.buckets[6]?.totals.find((item) => item.category === "history")?.tokens).toBe(4);
    expect(loaded.dashboard.buckets[0]?.totals.every((item) => item.tokens === 0)).toBe(true);
    expect(loaded.dashboard.today.find((item) => item.category === "history")?.tokens).toBe(4);
    expect(loaded.dashboard.agents).toEqual(["support-agent", "triage-bot"]);
    expect(loaded.dashboard.models).toEqual(["claude-haiku-4-5", "claude-sonnet-4-5"]);
  });

  it("filters by agent, model and time range", async () => {
    const { admin, project, events, deps } = await setup();
    await events.create({
      externalId: "kept",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 9,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: null,
      createdAt: new Date("2026-11-10T16:00:00.000Z"),
      breakdowns: rows({ user_input: 9 }, { text: 2 }),
    });
    await events.create({
      externalId: "other-agent",
      projectId: project.id,
      agentName: "triage-bot",
      model: "claude-sonnet-4-5",
      inputTokens: 3,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: null,
      createdAt: new Date("2026-11-10T16:05:00.000Z"),
      breakdowns: rows({ user_input: 3 }, { text: 1 }),
    });
    await events.create({
      externalId: "too-old",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 8,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: null,
      createdAt: new Date("2026-11-08T12:00:00.000Z"),
      breakdowns: rows({ user_input: 8 }, { text: 1 }),
    });

    const loaded = await loadDashboard(
      admin.id,
      { projectId: project.id, agent: "support-agent", model: "claude-sonnet-4-5", range: "24h" },
      NOW,
      deps,
    );

    expect(loaded.status).toBe(200);
    if (loaded.status !== 200) return;
    expect(loaded.dashboard.calls.map((call) => call.inputTokens)).toEqual([9]);
    expect(loaded.dashboard.buckets).toHaveLength(24);
    expect(loaded.dashboard.agents).toEqual(["support-agent", "triage-bot"]);
  });

  it("hides calls from projects the user cannot access", async () => {
    const { admin, outsider, project, events, deps } = await setup();
    await events.create({
      externalId: "private",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 9,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: null,
      createdAt: new Date("2026-11-10T12:00:00.000Z"),
      breakdowns: rows({ system: 9 }, { text: 2 }),
    });

    const denied = await loadDashboard(outsider.id, { projectId: project.id, range: "7d" }, NOW, deps);
    const own = await loadDashboard(outsider.id, { range: "7d" }, NOW, deps);

    expect(denied.status).toBe(403);
    expect(own.status).toBe(200);
    if (own.status !== 200) return;
    expect(own.dashboard.calls).toEqual([]);
    expect(own.dashboard.totals.calls).toBe(0);

    const member = await loadDashboard(admin.id, { range: "7d" }, NOW, deps);
    expect(member.status).toBe(200);
    if (member.status !== 200) return;
    expect(member.dashboard.calls).toHaveLength(1);
  });

  it("returns category tokens for one call and leaves cost unavailable", async () => {
    const { admin, outsider, project, events, deps } = await setup();
    const stored = await events.create({
      externalId: "evt-support-1",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 9,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheWriteTokens: 1,
      estimated: false,
      costUsd: null,
      createdAt: new Date("2026-11-10T12:00:00.000Z"),
      breakdowns: rows({ system: 5, user_input: 4 }, { text: 2 }),
    });

    const detail = await loadCallDetail(admin.id, project.id, stored.id, deps);
    const hidden = await loadCallDetail(outsider.id, project.id, stored.id, deps);

    expect(hidden).toBeNull();
    expect(detail).toMatchObject({
      id: stored.id,
      externalId: "evt-support-1",
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 9,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheWriteTokens: 1,
      estimated: false,
      costUsd: null,
      output: { text: 2, thinking: 0, tool_use: 0 },
    });
    expect(detail?.input.map((item) => item.category)).toEqual([...INPUT_CATEGORIES]);
    expect(detail?.input.reduce((sum, item) => sum + item.tokens, 0)).toBe(9);
    expect(detail?.input.find((item) => item.category === "system")).toMatchObject({ tokens: 5, share: 5 / 9 });
    expect(detail?.input.find((item) => item.category === "overhead")).toMatchObject({ tokens: 0, share: 0 });
  });

  it("shows a stored cost and sums the range only when every call has one", async () => {
    const { admin, project, events, deps } = await setup();
    const priced = await events.create({
      externalId: "priced",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 9,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: "1.50000000",
      createdAt: new Date("2026-11-10T12:00:00.000Z"),
      breakdowns: rows({ user_input: 9 }, { text: 2 }),
    });
    await events.create({
      externalId: "also-priced",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 4,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: "0.25000000",
      createdAt: new Date("2026-11-10T13:00:00.000Z"),
      breakdowns: rows({ user_input: 4 }, { text: 1 }),
    });

    const loaded = await loadDashboard(admin.id, { range: "7d" }, NOW, deps);
    expect(loaded.status).toBe(200);
    if (loaded.status !== 200) return;
    expect(loaded.dashboard.calls.map((call) => call.costUsd)).toEqual(["0.25000000", "1.50000000"]);
    expect(loaded.dashboard.totals.costUsd).toBe("1.75000000");

    const detail = await loadCallDetail(admin.id, project.id, priced.id, deps);
    expect(detail?.costUsd).toBe("1.50000000");

    await events.create({
      externalId: "unpriced",
      projectId: project.id,
      agentName: "support-agent",
      model: "claude-sonnet-4-5",
      inputTokens: 2,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimated: false,
      costUsd: null,
      createdAt: new Date("2026-11-10T14:00:00.000Z"),
      breakdowns: rows({ user_input: 2 }, { text: 1 }),
    });
    const mixed = await loadDashboard(admin.id, { range: "7d" }, NOW, deps);
    expect(mixed.status).toBe(200);
    if (mixed.status !== 200) return;
    expect(mixed.dashboard.calls[0]?.costUsd).toBeNull();
    expect(mixed.dashboard.totals.costUsd).toBeNull();
  });
});
