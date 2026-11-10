import { describe, expect, it } from "vitest";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import { signSession } from "@/lib/auth/session";
import { INPUT_CATEGORIES } from "@/lib/classifier/types";
import { MemoryOrganizationRepository } from "@/lib/services/memory-organization-repository";
import { MemoryProjectRepository } from "@/lib/services/memory-project-repository";
import { MemoryEventRepository } from "@/lib/services/memory-event-repository";
import { applyLiveCall, connectionLabel, handleProjectStream, STREAM_POLL_MS, type StreamDependencies } from "@/lib/services/stream";
import { publishStoredEvent } from "@/lib/services/call-bus";
import type { BreakdownRow, StoredEvent } from "@/lib/services/event-repository";

const SECRET = "tokenlens-unit-test";

function rows(category: (typeof INPUT_CATEGORIES)[number], tokens: number): BreakdownRow[] {
  return [
    ...INPUT_CATEGORIES.map((name) => ({ direction: "input" as const, category: name, tokens: name === category ? tokens : 0 })),
    { direction: "output", category: "text", tokens: 1 },
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
  const other = await projects.create({ orgId: org.id, name: "Other", createdBy: admin.id });
  const token = await signSession({ sub: admin.id, email: admin.email }, SECRET);
  const deps: StreamDependencies = { orgs, projects, events, secret: SECRET, pollMs: 20 };
  return { admin, outsider, project, other, events, deps, cookie: `tokenlens_session=${token}` };
}

function event(projectId: string, agentName: string, createdAt: Date): Omit<StoredEvent, "id"> {
  return {
    externalId: `${agentName}-${createdAt.getTime()}`,
    projectId,
    agentName,
    model: "claude-sonnet-4-5",
    inputTokens: 4,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimated: false,
    costUsd: null,
    createdAt,
    breakdowns: rows("history", 4),
  };
}

function readerOf(response: Response) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  return {
    text: () => text,
    async until(stop: (value: string) => boolean) {
      if (!reader) return text;
      const deadline = Date.now() + 1000;
      while (!stop(text) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (value) text += decoder.decode(value);
        if (done) break;
      }
      return text;
    },
  };
}

describe("live call stream", () => {
  it("puts a new call at the top and ignores a duplicate id", () => {
    const first = { id: "a", agentName: "support-agent" };
    const second = { id: "b", agentName: "triage-bot" };
    expect(applyLiveCall([first], second)).toEqual([second, first]);
    expect(applyLiveCall([second, first], second)).toEqual([second, first]);
    expect(connectionLabel("open")).toBe("Live");
    expect(connectionLabel("error")).toBe("Reconnecting");
    expect(STREAM_POLL_MS).toBeLessThanOrEqual(2000);
  });

  it("rejects a missing session and a project the user cannot read", async () => {
    const { outsider, project, deps } = await setup();
    const missing = await handleProjectStream(new Request(`http://localhost/api/v1/stream?projectId=${project.id}`), deps);
    const token = await signSession({ sub: outsider.id, email: outsider.email }, SECRET);
    const denied = await handleProjectStream(
      new Request(`http://localhost/api/v1/stream?projectId=${project.id}`, { headers: { cookie: `tokenlens_session=${token}` } }),
      deps,
    );

    expect(missing.status).toBe(401);
    expect(denied.status).toBe(403);
  });

  it("sends a new authorized call and resumes after the last event id", async () => {
    const { project, other, events, deps, cookie } = await setup();
    const controller = new AbortController();
    const response = await handleProjectStream(
      new Request(`http://localhost/api/v1/stream?projectId=${project.id}`, { headers: { cookie }, signal: controller.signal }),
      deps,
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const live = readerOf(response);
    const opened = await live.until((text) => text.includes("retry:"));
    expect(opened).toContain("retry: 1000");

    const stored = await events.create(event(project.id, "support-agent", new Date(Date.now() + 50)));
    publishStoredEvent(stored);
    const delivered = await live.until((text) => text.includes("support-agent"));
    expect(delivered).toContain(`id: ${stored.id}`);
    expect(delivered).toContain('"costUsd":null');
    controller.abort();

    const resume = new AbortController();
    const again = await handleProjectStream(
      new Request(`http://localhost/api/v1/stream?projectId=${project.id}`, {
        headers: { cookie, "last-event-id": stored.id },
        signal: resume.signal,
      }),
      deps,
    );
    const resumedReader = readerOf(again);
    await resumedReader.until((text) => text.includes("retry:"));
    const hidden = await events.create(event(other.id, "other-project", new Date(Date.now() + 80)));
    publishStoredEvent(hidden);
    const newer = await events.create(event(project.id, "triage-bot", new Date(Date.now() + 100)));
    publishStoredEvent(newer);
    const resumed = await resumedReader.until((text) => text.includes("triage-bot"));
    expect(resumed).toContain("triage-bot");
    expect(resumed).not.toContain("support-agent");
    expect(resumed).not.toContain("other-project");
    resume.abort();
  });

  it("delivers a call stored on another instance by polling", async () => {
    const { project, events, deps, cookie } = await setup();
    const controller = new AbortController();
    const response = await handleProjectStream(
      new Request(`http://localhost/api/v1/stream?projectId=${project.id}`, { headers: { cookie }, signal: controller.signal }),
      deps,
    );
    const polled = readerOf(response);
    await polled.until((text) => text.includes("retry:"));
    await events.create(event(project.id, "polled-agent", new Date(Date.now() + 20)));
    const text = await polled.until((value) => value.includes("polled-agent"));
    expect(text).toContain("polled-agent");
    controller.abort();
  });
});
