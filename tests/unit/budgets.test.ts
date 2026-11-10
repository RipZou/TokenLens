import { describe, expect, it } from "vitest";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import { signSession } from "@/lib/auth/session";
import { MemoryOrganizationRepository } from "@/lib/services/memory-organization-repository";
import { MemoryProjectRepository } from "@/lib/services/memory-project-repository";
import { handleCreateApiKey, handleCreateProject, type ProjectDependencies } from "@/lib/services/projects";
import { handleIngestEvent, type IngestDependencies } from "@/lib/services/events";
import { MemoryEventRepository } from "@/lib/services/memory-event-repository";
import { MemoryRateLimiter } from "@/lib/services/rate-limit";
import {
  BUDGET_POLL_MS,
  BUDGET_TIME_ZONE,
  handleGetBudgets,
  handlePutBudget,
  handlePutModelPrice,
  type BudgetDependencies,
} from "@/lib/services/budgets";
import { MemoryBudgetRepository } from "@/lib/services/memory-budget-repository";

const SECRET = "tokenlens-unit-test";

const report = {
  id: "evt-support-1",
  provider: "anthropic",
  agent: "support-agent",
  model: "claude-sonnet-4-5",
  request: {
    model: "claude-sonnet-4-5",
    system: "You are a support agent",
    messages: [{ role: "user", content: "Where is my order" }],
  },
  usage: { input_tokens: 1_000_000, output_tokens: 0 },
};

type World = {
  projectDeps: ProjectDependencies;
  budgetDeps: BudgetDependencies;
  ingest: IngestDependencies;
  budgets: MemoryBudgetRepository;
  events: MemoryEventRepository;
  orgId: string;
  adminCookie: string;
  developerCookie: string;
};

async function setup(): Promise<World> {
  const users = new MemoryUserRepository();
  const orgs = new MemoryOrganizationRepository();
  const projects = new MemoryProjectRepository();
  const events = new MemoryEventRepository();
  const budgets = new MemoryBudgetRepository(events);
  const projectDeps: ProjectDependencies = { orgs, projects, secret: SECRET };
  const budgetDeps: BudgetDependencies = { orgs, projects, budgets, secret: SECRET };
  const admin = await users.create({ email: "admin@example.com", passwordHash: "$2b$12$hash" });
  const developer = await users.create({ email: "dev@example.com", passwordHash: "$2b$12$hash" });
  const org = await orgs.createWithAdmin("Acme AI", { id: admin.id, email: admin.email });
  await orgs.addMember(org.id, { userId: developer.id, email: developer.email, role: "DEVELOPER" });
  const adminToken = await signSession({ sub: admin.id, email: admin.email }, SECRET);
  const developerToken = await signSession({ sub: developer.id, email: developer.email }, SECRET);
  return {
    projectDeps,
    budgetDeps,
    budgets,
    events,
    orgId: org.id,
    adminCookie: `tokenlens_session=${adminToken}`,
    developerCookie: `tokenlens_session=${developerToken}`,
    ingest: { projects, events, budgets, rateLimiter: new MemoryRateLimiter() },
  };
}

function jsonRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function issueKey(world: World): Promise<string> {
  const cookie = world.adminCookie;
  const created = await handleCreateProject(
    jsonRequest("POST", `/api/orgs/${world.orgId}/projects`, { name: "Support agent" }, { cookie }),
    world.orgId,
    world.projectDeps,
  );
  const projectId = ((await created.json()) as { id: string }).id;
  const keyResponse = await handleCreateApiKey(
    jsonRequest("POST", `/api/projects/${projectId}/keys`, undefined, { cookie }),
    projectId,
    world.projectDeps,
  );
  return ((await keyResponse.json()) as { key: string }).key;
}

function ingest(world: World, key: string, id: string, now: Date): Promise<Response> {
  return handleIngestEvent(
    jsonRequest("POST", "/api/v1/events", { ...report, id }, { authorization: `Bearer ${key}` }),
    { ...world.ingest, now: () => now },
  );
}

describe("budgets", () => {
  it("uses UTC days and months, and checks for alerts at least every two seconds", () => {
    expect(BUDGET_TIME_ZONE).toBe("UTC");
    expect(BUDGET_POLL_MS).toBeLessThanOrEqual(2000);
  });

  it("lets an Admin save a daily and a monthly budget and refuses a Developer", async () => {
    const world = await setup();

    const denied = await handlePutBudget(
      jsonRequest("PUT", `/api/orgs/${world.orgId}/budgets`, { period: "day", limitUsd: "25" }, { cookie: world.developerCookie }),
      world.orgId,
      world.budgetDeps,
    );
    expect(denied.status).toBe(403);

    const daily = await handlePutBudget(
      jsonRequest("PUT", `/api/orgs/${world.orgId}/budgets`, { period: "day", limitUsd: "25" }, { cookie: world.adminCookie }),
      world.orgId,
      world.budgetDeps,
    );
    expect(daily.status).toBe(200);
    const monthly = await handlePutBudget(
      jsonRequest("PUT", `/api/orgs/${world.orgId}/budgets`, { period: "month", limitUsd: "500.5" }, { cookie: world.adminCookie }),
      world.orgId,
      world.budgetDeps,
    );
    expect(monthly.status).toBe(200);

    const loaded = await handleGetBudgets(
      jsonRequest("GET", `/api/orgs/${world.orgId}/budgets`, undefined, { cookie: world.developerCookie }),
      world.orgId,
      world.budgetDeps,
      new Date("2026-11-10T18:00:00.000Z"),
    );
    expect(loaded.status).toBe(200);
    const body = (await loaded.json()) as {
      timeZone: string;
      day: { start: string; end: string };
      month: { start: string; end: string };
      budgets: { period: string; limitUsd: string }[];
    };
    expect(body.timeZone).toBe("UTC");
    expect(body.day).toEqual({ start: "2026-11-10T00:00:00.000Z", end: "2026-11-11T00:00:00.000Z" });
    expect(body.month).toEqual({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" });
    expect(body.budgets).toEqual([
      expect.objectContaining({ period: "day", limitUsd: "25.00000000" }),
      expect.objectContaining({ period: "month", limitUsd: "500.50000000" }),
    ]);
  });

  it("fires 80% and 100% once per UTC period, and prices unknown models as unavailable", async () => {
    const world = await setup();
    const key = await issueKey(world);
    const priced = await handlePutModelPrice(
      jsonRequest(
        "PUT",
        "/api/model-prices",
        { model: "claude-sonnet-4-5", inputPerMtok: "1", outputPerMtok: "0" },
        { cookie: world.adminCookie },
      ),
      world.budgetDeps,
    );
    expect(priced.status).toBe(200);
    const developerPrice = await handlePutModelPrice(
      jsonRequest(
        "PUT",
        "/api/model-prices",
        { model: "claude-sonnet-4-5", inputPerMtok: "9", outputPerMtok: "9" },
        { cookie: world.developerCookie },
      ),
      world.budgetDeps,
    );
    expect(developerPrice.status).toBe(403);

    await handlePutBudget(
      jsonRequest("PUT", `/api/orgs/${world.orgId}/budgets`, { period: "day", limitUsd: "2" }, { cookie: world.adminCookie }),
      world.orgId,
      world.budgetDeps,
    );

    const firstDay = new Date("2026-11-10T23:00:00.000Z");
    expect((await ingest(world, key, "evt-1", firstDay)).status).toBe(201);
    const afterOne = await alerts(world, firstDay);
    expect(afterOne).toEqual([]);

    expect((await ingest(world, key, "evt-2", firstDay)).status).toBe(201);
    const crossed = await alerts(world, firstDay);
    expect(crossed.map((alert) => alert.level)).toEqual([100, 80]);
    expect(crossed[0]).toEqual(expect.objectContaining({ period: "day", spendUsd: "2.00000000", limitUsd: "2.00000000" }));
    expect(world.events.saved().find((event) => event.externalId === "evt-1")?.costUsd).toBe("1.00000000");

    expect((await ingest(world, key, "evt-3", firstDay)).status).toBe(201);
    expect(await alerts(world, firstDay)).toHaveLength(2);

    const nextDay = new Date("2026-11-11T00:30:00.000Z");
    expect((await ingest(world, key, "evt-4", nextDay)).status).toBe(201);
    expect((await ingest(world, key, "evt-5", nextDay)).status).toBe(201);
    const secondPeriod = (await alerts(world, nextDay)).filter((alert) => alert.periodStart === "2026-11-11T00:00:00.000Z");
    expect(secondPeriod.map((alert) => alert.level).sort((left, right) => left - right)).toEqual([80, 100]);

    const quietDay = new Date("2026-11-12T12:00:00.000Z");
    const unpriced = await handleIngestEvent(
      jsonRequest(
        "POST",
        "/api/v1/events",
        { ...report, id: "evt-unpriced", model: "unknown-model" },
        { authorization: `Bearer ${key}` },
      ),
      { ...world.ingest, now: () => quietDay },
    );
    expect(unpriced.status).toBe(201);
    expect(world.events.saved().find((event) => event.externalId === "evt-unpriced")?.costUsd).toBeNull();
    expect((await alerts(world, quietDay)).filter((alert) => alert.periodStart === "2026-11-12T00:00:00.000Z")).toEqual([]);
  });
});

async function alerts(
  world: World,
  now: Date,
): Promise<{ level: number; period: string; periodStart: string; spendUsd: string; limitUsd: string }[]> {
  const response = await handleGetBudgets(
    jsonRequest("GET", `/api/orgs/${world.orgId}/budgets`, undefined, { cookie: world.adminCookie }),
    world.orgId,
    world.budgetDeps,
    now,
  );
  const body = (await response.json()) as {
    alerts: { level: number; period: string; periodStart: string; spendUsd: string; limitUsd: string }[];
  };
  return body.alerts;
}
