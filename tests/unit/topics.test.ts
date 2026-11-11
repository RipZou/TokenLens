import { describe, expect, it } from "vitest";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import { signSession } from "@/lib/auth/session";
import { MemoryOrganizationRepository } from "@/lib/services/memory-organization-repository";
import { MemoryProjectRepository } from "@/lib/services/memory-project-repository";
import { handleCreateApiKey, handleCreateProject } from "@/lib/services/projects";
import { handleIngestEvent } from "@/lib/services/events";
import { MemoryEventRepository } from "@/lib/services/memory-event-repository";
import { MemoryRateLimiter } from "@/lib/services/rate-limit";
import { tagRequest } from "@/lib/topics/tag";

const SECRET = "tokenlens-unit-test";

const report = {
  id: "evt-topic-1",
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

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

async function reportWith(body: unknown, topicFor?: (text: string) => string) {
  const users = new MemoryUserRepository();
  const orgs = new MemoryOrganizationRepository();
  const projects = new MemoryProjectRepository();
  const events = new MemoryEventRepository();
  const projectDeps = { orgs, projects, secret: SECRET };
  const admin = await users.create({ email: "admin@example.com", passwordHash: "$2b$12$hash" });
  const org = await orgs.createWithAdmin("Acme AI", { id: admin.id, email: admin.email });
  const cookie = `tokenlens_session=${await signSession({ sub: admin.id, email: admin.email }, SECRET)}`;
  const created = await handleCreateProject(
    new Request("http://localhost/projects", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Support" }),
    }),
    org.id,
    projectDeps,
  );
  const projectId = ((await created.json()) as { id: string }).id;
  const keyResponse = await handleCreateApiKey(
    new Request("http://localhost/keys", { method: "POST", headers: { cookie } }),
    projectId,
    projectDeps,
  );
  const key = ((await keyResponse.json()) as { key: string }).key;
  const response = await handleIngestEvent(
    new Request("http://localhost/api/v1/events", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { projects, events, rateLimiter: new MemoryRateLimiter(), topicFor },
  );
  return { response, events };
}

describe("topic tags", () => {
  it("groups segment tokens by topic and leaves structural categories unchanged", () => {
    const topics = tagRequest(
      { system: "account policy", messages: [{ role: "user", content: "Where is my order" }] },
      wordCount,
    );
    expect(topics).toEqual([
      { topic: "orders", tokens: 4 },
      { topic: "support", tokens: 2 },
    ]);
  });

  it("stores topics only when the report asks for them", async () => {
    const enabled = await reportWith({ ...report, tagTopics: true });
    expect(enabled.response.status).toBe(201);
    expect(enabled.events.saved()[0]?.topics).toEqual([
      { topic: "general", tokens: 5 },
      { topic: "orders", tokens: 4 },
    ]);

    const disabled = await reportWith(report);
    expect(disabled.events.saved()[0]?.topics).toEqual([]);
  });

  it("keeps the structural report when topic tagging throws", async () => {
    const result = await reportWith({ ...report, id: "evt-topic-fail", tagTopics: true }, () => {
      throw new Error("tagger down");
    });
    expect(result.response.status).toBe(201);
    const body = (await result.response.json()) as { input: { user_input: number } };
    expect(body.input.user_input).toBeGreaterThan(0);
    expect(result.events.saved()[0]?.topics).toEqual([]);
  });
});
