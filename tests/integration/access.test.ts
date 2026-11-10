import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { handleRegister } from "@/lib/auth/handlers";
import { readCookie, SESSION_COOKIE } from "@/lib/auth/session";
import { PrismaEventRepository } from "@/lib/db/event-repository";
import { PrismaBudgetRepository } from "@/lib/db/budget-repository";
import { loadCallDetail } from "@/lib/services/calls";
import { handleIngestEvent } from "@/lib/services/events";
import { handleGetBudgets, handlePutBudget, handlePutModelPrice } from "@/lib/services/budgets";
import { handleAddMember, handleGetOrganization } from "@/lib/services/organizations";
import { MemoryRateLimiter } from "@/lib/services/rate-limit";
import {
  authenticateApiKey,
  handleCreateApiKey,
  handleCreateProject,
  handleRevokeApiKey,
  listProjectsForUser,
} from "@/lib/services/projects";
import { db, repositories, resetDatabase, SECRET } from "./db";

type Account = { id: string; cookie: string; orgId: string };

const repos = repositories();
const deps = { ...repos, secret: SECRET };

function request(method: string, path: string, cookie: string | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function register(email: string): Promise<Account> {
  const response = await handleRegister(
    request("POST", "/api/auth/register", null, { email, password: "integration-password" }),
    deps,
  );
  const { id } = (await response.json()) as { id: string };
  const token = readCookie(response.headers.get("set-cookie"), SESSION_COOKIE);
  const [personal] = await repos.orgs.listForUser(id);
  return { id, cookie: `${SESSION_COOKIE}=${token}`, orgId: personal.id };
}

async function addMember(orgId: string, admin: Account, email: string, role: string): Promise<Response> {
  return handleAddMember(request("POST", `/api/orgs/${orgId}/members`, admin.cookie, { email, role }), orgId, deps);
}

async function createProject(orgId: string, user: Account): Promise<Response> {
  return handleCreateProject(
    request("POST", `/api/orgs/${orgId}/projects`, user.cookie, { name: "Support agent" }),
    orgId,
    deps,
  );
}

async function createKey(projectId: string, user: Account): Promise<{ id: string; key: string }> {
  const response = await handleCreateApiKey(
    request("POST", `/api/projects/${projectId}/keys`, user.cookie),
    projectId,
    deps,
  );
  return (await response.json()) as { id: string; key: string };
}

function bearer(key: string): Request {
  return new Request("http://localhost/api/v1/events", { method: "POST", headers: { authorization: `Bearer ${key}` } });
}

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("PostgreSQL access rules", () => {
  it("gives each new account a personal organization it administers", async () => {
    const admin = await register("admin@example.com");

    const memberships = await repos.orgs.listForUser(admin.id);

    expect(memberships).toEqual([{ id: admin.orgId, name: "Personal", role: "ADMIN" }]);
  });

  it("returns 403 when a Viewer creates a project", async () => {
    const admin = await register("admin@example.com");
    const viewer = await register("viewer@example.com");
    await addMember(admin.orgId, admin, "viewer@example.com", "VIEWER");

    const response = await createProject(admin.orgId, viewer);

    expect(response.status).toBe(403);
    expect(await db.project.count({ where: { orgId: admin.orgId } })).toBe(0);
  });

  it("keeps one organization's data away from non-members", async () => {
    const admin = await register("admin@example.com");
    const outsider = await register("outsider@example.com");
    await createProject(admin.orgId, admin);

    const read = await handleGetOrganization(
      request("GET", `/api/orgs/${admin.orgId}`, outsider.cookie),
      admin.orgId,
      deps,
    );
    const outsiderProjects = await listProjectsForUser(outsider.id, deps);

    expect(read.status).toBe(403);
    expect(outsiderProjects.flatMap((organization) => organization.projects)).toEqual([]);
  });

  it("returns 409 when the same user is added twice", async () => {
    const admin = await register("admin@example.com");
    await register("dev@example.com");
    await addMember(admin.orgId, admin, "dev@example.com", "DEVELOPER");

    const response = await addMember(admin.orgId, admin, "dev@example.com", "VIEWER");

    expect(response.status).toBe(409);
  });

  it("stores only the key hash and rejects the key after it is revoked", async () => {
    const admin = await register("admin@example.com");
    const projectResponse = await createProject(admin.orgId, admin);
    const { id: projectId } = (await projectResponse.json()) as { id: string };
    const key = await createKey(projectId, admin);

    const row = await db.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(row.keyHash).toBe(createHash("sha256").update(key.key).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(key.key);
    expect(await authenticateApiKey(bearer(key.key), repos.projects)).toEqual({ keyId: key.id, projectId });

    await handleRevokeApiKey(
      request("DELETE", `/api/projects/${projectId}/keys/${key.id}`, admin.cookie),
      projectId,
      key.id,
      deps,
    );
    const result = await authenticateApiKey(bearer(key.key), repos.projects);

    expect(result instanceof Response && result.status).toBe(401);
  });

  it("stores a reported call and rejects a duplicate event id", async () => {
    const admin = await register("admin@example.com");
    const projectResponse = await createProject(admin.orgId, admin);
    const { id: projectId } = (await projectResponse.json()) as { id: string };
    const key = await createKey(projectId, admin);
    const deps = { projects: repos.projects, events: new PrismaEventRepository(db), rateLimiter: new MemoryRateLimiter() };
    const body = {
      provider: "anthropic",
      agent: "support-agent",
      model: "claude-sonnet-4-5",
      request: {
        model: "claude-sonnet-4-5",
        system: "You are a support agent",
        messages: [{ role: "user", content: "Where is my order" }],
      },
      usage: { input_tokens: 9, output_tokens: 2 },
    };
    const call = (id: string) =>
      new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" },
        body: JSON.stringify({ ...body, id }),
      });

    const created = await handleIngestEvent(call("evt-1"), deps);
    expect(created.status).toBe(201);
    const row = await db.event.findFirstOrThrow({
      where: { projectId, externalId: "evt-1" },
      include: { breakdowns: true },
    });
    expect(row.inputTokens).toBe(9);
    expect(row.breakdowns.find((item) => item.category === "user_input")?.tokens).toBe(4);
    expect(JSON.stringify(row)).not.toContain("Where is my order");

    const duplicate = await handleIngestEvent(call("evt-1"), deps);
    expect(duplicate.status).toBe(409);
  });

  it("shows a reported call to a member and hides it from other users", async () => {
    const admin = await register("admin@example.com");
    const outsider = await register("outsider@example.com");
    const projectResponse = await createProject(admin.orgId, admin);
    const { id: projectId } = (await projectResponse.json()) as { id: string };
    const key = await createKey(projectId, admin);
    const ingest = { projects: repos.projects, events: new PrismaEventRepository(db), rateLimiter: new MemoryRateLimiter() };
    const created = await handleIngestEvent(
      new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" },
        body: JSON.stringify({
          id: "evt-detail",
          provider: "anthropic",
          agent: "support-agent",
          model: "claude-sonnet-4-5",
          request: {
            model: "claude-sonnet-4-5",
            system: "You are a support agent",
            messages: [{ role: "user", content: "Where is my order" }],
          },
          usage: { input_tokens: 9, output_tokens: 2 },
        }),
      }),
      ingest,
    );
    expect(created.status).toBe(201);
    const row = await db.event.findFirstOrThrow({ where: { projectId, externalId: "evt-detail" } });
    const callDeps = { orgs: repos.orgs, projects: repos.projects, events: ingest.events };

    const detail = await loadCallDetail(admin.id, projectId, row.id, callDeps);
    const hidden = await loadCallDetail(outsider.id, projectId, row.id, callDeps);

    expect(detail?.inputTokens).toBe(9);
    expect(detail?.input.find((item) => item.category === "user_input")?.tokens).toBe(4);
    expect(detail?.costUsd).toBeNull();
    expect(hidden).toBeNull();
  });

  it("stores one alert per threshold when priced spend reaches the daily budget", async () => {
    const admin = await register("admin@example.com");
    const developer = await register("dev@example.com");
    await addMember(admin.orgId, admin, "dev@example.com", "DEVELOPER");
    const budgets = new PrismaBudgetRepository(db);
    const budgetDeps = { ...deps, budgets };
    const when = new Date("2026-11-10T23:00:00.000Z");

    const denied = await handlePutBudget(
      request("PUT", `/api/orgs/${admin.orgId}/budgets`, developer.cookie, { period: "day", limitUsd: "2" }),
      admin.orgId,
      budgetDeps,
    );
    expect(denied.status).toBe(403);

    expect(
      (
        await handlePutModelPrice(
          request("PUT", "/api/model-prices", admin.cookie, {
            model: "claude-sonnet-4-5",
            inputPerMtok: "1",
            outputPerMtok: "0",
          }),
          budgetDeps,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handlePutBudget(
          request("PUT", `/api/orgs/${admin.orgId}/budgets`, admin.cookie, { period: "day", limitUsd: "2" }),
          admin.orgId,
          budgetDeps,
        )
      ).status,
    ).toBe(200);

    const projectResponse = await createProject(admin.orgId, admin);
    const { id: projectId } = (await projectResponse.json()) as { id: string };
    const key = await createKey(projectId, admin);
    const ingest = {
      projects: repos.projects,
      events: new PrismaEventRepository(db),
      budgets,
      rateLimiter: new MemoryRateLimiter(),
      now: () => when,
    };
    const call = (id: string) =>
      new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" },
        body: JSON.stringify({
          id,
          provider: "anthropic",
          agent: "support-agent",
          model: "claude-sonnet-4-5",
          request: {
            model: "claude-sonnet-4-5",
            system: "You are a support agent",
            messages: [{ role: "user", content: "Where is my order" }],
          },
          usage: { input_tokens: 1_000_000, output_tokens: 0 },
        }),
      });

    const readAlerts = async () => {
      const response = await handleGetBudgets(
        request("GET", `/api/orgs/${admin.orgId}/budgets`, admin.cookie),
        admin.orgId,
        budgetDeps,
        when,
      );
      const body = (await response.json()) as { alerts: { level: number }[] };
      return body.alerts;
    };

    expect((await handleIngestEvent(call("evt-budget-1"), ingest)).status).toBe(201);
    expect(await readAlerts()).toEqual([]);
    expect((await handleIngestEvent(call("evt-budget-2"), ingest)).status).toBe(201);
    expect((await readAlerts()).map((alert) => alert.level)).toEqual([100, 80]);
    expect((await handleIngestEvent(call("evt-budget-3"), ingest)).status).toBe(201);
    expect(await readAlerts()).toHaveLength(2);

    const row = await db.event.findFirstOrThrow({ where: { externalId: "evt-budget-1" } });
    expect(row.costUsd?.toFixed(8)).toBe("1.00000000");
  });
});
