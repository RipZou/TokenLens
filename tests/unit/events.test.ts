import { describe, expect, it } from "vitest";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import { signSession } from "@/lib/auth/session";
import { INPUT_CATEGORIES } from "@/lib/classifier/types";
import { MemoryOrganizationRepository } from "@/lib/services/memory-organization-repository";
import { MemoryProjectRepository } from "@/lib/services/memory-project-repository";
import { handleCreateApiKey, handleCreateProject, handleRevokeApiKey, type ProjectDependencies } from "@/lib/services/projects";
import { handleIngestEvent, INGEST_RATE_LIMIT, type IngestDependencies } from "@/lib/services/events";
import { MemoryEventRepository } from "@/lib/services/memory-event-repository";
import { MemoryRateLimiter } from "@/lib/services/rate-limit";

const SECRET = "test-secret-that-is-long-enough-for-hs256";
const MAX_BODY_BYTES = 1024 * 1024;

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
  usage: { input_tokens: 9, output_tokens: 2 },
};

type World = {
  projectDeps: ProjectDependencies;
  ingest: IngestDependencies;
  events: MemoryEventRepository;
  orgId: string;
  adminCookie: string;
};

async function setup(): Promise<World> {
  const users = new MemoryUserRepository();
  const orgs = new MemoryOrganizationRepository();
  const projects = new MemoryProjectRepository();
  const events = new MemoryEventRepository();
  const projectDeps: ProjectDependencies = { orgs, projects, secret: SECRET };
  const admin = await users.create({ email: "admin@example.com", passwordHash: "$2b$12$hash" });
  const org = await orgs.createWithAdmin("Acme AI", { id: admin.id, email: admin.email });
  const token = await signSession({ sub: admin.id, email: admin.email }, SECRET);
  return {
    projectDeps,
    events,
    orgId: org.id,
    adminCookie: `tokenlens_session=${token}`,
    ingest: { projects, events, rateLimiter: new MemoryRateLimiter() },
  };
}

function jsonRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function issueKey(world: World): Promise<{ projectId: string; key: string; keyId: string }> {
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
  const key = (await keyResponse.json()) as { id: string; key: string };
  return { projectId, key: key.key, keyId: key.id };
}

function ingest(world: World, key: string | null, body: unknown = report, extra: Record<string, string> = {}): Promise<Response> {
  const headers: Record<string, string> = { ...extra };
  if (key) headers.authorization = `Bearer ${key}`;
  return handleIngestEvent(jsonRequest("POST", "/api/v1/events", body, headers), world.ingest);
}

describe("POST /api/v1/events", () => {
  it("classifies a reported call, stores counts only, and returns 201", async () => {
    const world = await setup();
    const { projectId, key } = await issueKey(world);

    const response = await ingest(world, key);

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      id: string;
      projectId: string;
      estimated: boolean;
      input: Record<string, number>;
      usage: { input_tokens: number; output_tokens: number };
    };
    expect(body.id).toBe(report.id);
    expect(body.projectId).toBe(projectId);
    expect(body.estimated).toBe(false);
    expect(body.input).toEqual({
      system: 5,
      tool_definitions: 0,
      history: 0,
      tool_results: 0,
      retrieval: 0,
      user_input: 4,
      attachments: 0,
      overhead: 0,
    });
    expect(INPUT_CATEGORIES.reduce((sum, category) => sum + body.input[category], 0)).toBe(9);
    expect(body.usage.input_tokens).toBe(9);
    const stored = world.events.saved();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.projectId).toBe(projectId);
    expect(stored[0]?.agentName).toBe("support-agent");
    expect(stored[0]?.model).toBe("claude-sonnet-4-5");
    expect(stored[0]?.inputTokens).toBe(9);
    expect(stored[0]?.outputTokens).toBe(2);
    expect(stored[0]?.estimated).toBe(false);
    expect(JSON.stringify(stored)).not.toContain("Where is my order");
    expect(stored[0]?.breakdowns.some((row) => row.direction === "input" && row.category === "system" && row.tokens === 5)).toBe(true);
  });

  it("returns 400 for an invalid body", async () => {
    const world = await setup();
    const { key } = await issueKey(world);

    const response = await ingest(world, key, { id: "evt-bad" });

    expect(response.status).toBe(400);
    expect(world.events.saved()).toHaveLength(0);
  });

  it("returns 401 when the API key is missing or revoked", async () => {
    const world = await setup();
    const issued = await issueKey(world);

    const missing = await ingest(world, null);
    expect(missing.status).toBe(401);

    await handleRevokeApiKey(
      jsonRequest("DELETE", `/api/projects/${issued.projectId}/keys/${issued.keyId}`, undefined, { cookie: world.adminCookie }),
      issued.projectId,
      issued.keyId,
      world.projectDeps,
    );
    const revoked = await ingest(world, issued.key);
    expect(revoked.status).toBe(401);
    expect(world.events.saved()).toHaveLength(0);
  });

  it("returns 413 when the body is larger than 1 MB", async () => {
    const world = await setup();
    const { key } = await issueKey(world);

    const response = await ingest(world, key, report, { "content-length": String(MAX_BODY_BYTES + 1) });

    expect(response.status).toBe(413);
    expect(world.events.saved()).toHaveLength(0);
  });

  it("returns 429 after 600 reports from the same key in one minute", async () => {
    const world = await setup();
    const { key } = await issueKey(world);

    for (let index = 0; index < INGEST_RATE_LIMIT; index += 1) {
      const response = await ingest(world, key, { ...report, id: `evt-${index}` });
      expect(response.status).toBe(201);
    }
    const blocked = await ingest(world, key, { ...report, id: "evt-over-limit" });
    expect(blocked.status).toBe(429);
    expect(world.events.saved()).toHaveLength(INGEST_RATE_LIMIT);
  });

  it("rejects a duplicate event id in the same project", async () => {
    const world = await setup();
    const { key } = await issueKey(world);

    expect((await ingest(world, key)).status).toBe(201);
    const duplicate = await ingest(world, key);

    expect(duplicate.status).toBe(409);
    expect(world.events.saved()).toHaveLength(1);
  });
});
