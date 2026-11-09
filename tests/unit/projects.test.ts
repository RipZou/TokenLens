import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import type { Role } from "@/lib/auth/permissions";
import { signSession } from "@/lib/auth/session";
import { MemoryOrganizationRepository } from "@/lib/services/memory-organization-repository";
import { MemoryProjectRepository } from "@/lib/services/memory-project-repository";
import {
  authenticateApiKey,
  handleCreateApiKey,
  handleCreateProject,
  handleListApiKeys,
  handleRevokeApiKey,
  listProjectsForUser,
  loadKeysPage,
  type ProjectDependencies,
} from "@/lib/services/projects";

const SECRET = "test-secret-that-is-long-enough-for-hs256";

type TestUser = { id: string; cookie: string };

type World = {
  deps: ProjectDependencies;
  orgId: string;
  admin: TestUser;
  dev: TestUser;
  otherDev: TestUser;
  viewer: TestUser;
  outsider: TestUser;
};

async function signUp(users: MemoryUserRepository, email: string): Promise<TestUser> {
  const user = await users.create({ email, passwordHash: "$2b$12$hash" });
  const token = await signSession({ sub: user.id, email: user.email }, SECRET);
  return { id: user.id, cookie: `tokenlens_session=${token}` };
}

async function setup(): Promise<World> {
  const users = new MemoryUserRepository();
  const orgs = new MemoryOrganizationRepository();
  const deps: ProjectDependencies = { orgs, projects: new MemoryProjectRepository(), secret: SECRET };

  const admin = await signUp(users, "admin@example.com");
  const dev = await signUp(users, "dev@example.com");
  const otherDev = await signUp(users, "other-dev@example.com");
  const viewer = await signUp(users, "viewer@example.com");
  const outsider = await signUp(users, "outsider@example.com");

  const org = await orgs.createWithAdmin("Acme AI", { id: admin.id, email: "admin@example.com" });
  const members: [TestUser, string, Role][] = [
    [dev, "dev@example.com", "DEVELOPER"],
    [otherDev, "other-dev@example.com", "DEVELOPER"],
    [viewer, "viewer@example.com", "VIEWER"],
  ];
  for (const [user, email, role] of members) {
    await orgs.addMember(org.id, { userId: user.id, email, role });
  }

  return { deps, orgId: org.id, admin, dev, otherDev, viewer, outsider };
}

function request(method: string, path: string, user: TestUser | null, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers.cookie = user.cookie;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createProject(world: World, user: TestUser, name = "Support agent"): Promise<Response> {
  return handleCreateProject(
    request("POST", `/api/orgs/${world.orgId}/projects`, user, { name }),
    world.orgId,
    world.deps,
  );
}

async function projectIdFor(world: World, user: TestUser): Promise<string> {
  const response = await createProject(world, user);
  return ((await response.json()) as { id: string }).id;
}

async function createKey(world: World, projectId: string, user: TestUser): Promise<Response> {
  return handleCreateApiKey(request("POST", `/api/projects/${projectId}/keys`, user), projectId, world.deps);
}

async function issueKey(world: World, projectId: string, user: TestUser): Promise<{ id: string; key: string }> {
  const response = await createKey(world, projectId, user);
  return (await response.json()) as { id: string; key: string };
}

function bearer(key: string): Request {
  return new Request("http://localhost/api/v1/events", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
  });
}

describe("projects", () => {
  it("lets a Developer create a project in their organization", async () => {
    const world = await setup();

    const response = await createProject(world, world.dev);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string; orgId: string };
    expect(body.name).toBe("Support agent");
    expect(body.orgId).toBe(world.orgId);
  });

  it("returns 403 when a Viewer creates a project", async () => {
    const world = await setup();

    const response = await createProject(world, world.viewer);

    expect(response.status).toBe(403);
  });

  it("returns 403 when a non-member creates a project", async () => {
    const world = await setup();

    const response = await createProject(world, world.outsider);

    expect(response.status).toBe(403);
  });

  it("returns 401 when creating a project without a session", async () => {
    const world = await setup();

    const response = await handleCreateProject(
      request("POST", `/api/orgs/${world.orgId}/projects`, null, { name: "Support agent" }),
      world.orgId,
      world.deps,
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a blank project name", async () => {
    const world = await setup();

    const response = await createProject(world, world.admin, "  ");

    expect(response.status).toBe(400);
  });
});

describe("API keys", () => {
  it("shows the full key once and stores only its SHA-256 hash and prefix", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);

    const response = await createKey(world, projectId, world.dev);

    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string; key: string; prefix: string };
    expect(created.key.startsWith(created.prefix)).toBe(true);
    expect(created.key.length).toBeGreaterThan(created.prefix.length + 30);

    const hash = createHash("sha256").update(created.key).digest("hex");
    const stored = await world.deps.projects.findKeyByHash(hash);
    expect(stored?.prefix).toBe(created.prefix);
    expect(JSON.stringify(stored)).not.toContain(created.key);

    const list = await handleListApiKeys(
      request("GET", `/api/projects/${projectId}/keys`, world.viewer),
      projectId,
      world.deps,
    );
    expect(list.status).toBe(200);
    const listed = (await list.json()) as Record<string, unknown>[];
    expect(listed).toHaveLength(1);
    expect(listed[0].prefix).toBe(created.prefix);
    expect(listed[0]).not.toHaveProperty("key");
    expect(listed[0]).not.toHaveProperty("keyHash");
  });

  it("issues a different key each time", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.admin);

    const first = await issueKey(world, projectId, world.admin);
    const second = await issueKey(world, projectId, world.admin);

    expect(first.key).not.toBe(second.key);
  });

  it("lets an Admin manage keys on a Developer's project", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);

    const response = await createKey(world, projectId, world.admin);

    expect(response.status).toBe(201);
  });

  it("returns 403 when a Developer manages keys on another member's project", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);

    const response = await createKey(world, projectId, world.otherDev);

    expect(response.status).toBe(403);
  });

  it("returns 403 when a Viewer creates a key", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.admin);

    const response = await createKey(world, projectId, world.viewer);

    expect(response.status).toBe(403);
  });

  it("returns 403 when a non-member lists a project's keys", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.admin);

    const response = await handleListApiKeys(
      request("GET", `/api/projects/${projectId}/keys`, world.outsider),
      projectId,
      world.deps,
    );

    expect(response.status).toBe(403);
  });

  it("revokes a key and marks it in the key list", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);
    const key = await issueKey(world, projectId, world.dev);

    const response = await handleRevokeApiKey(
      request("DELETE", `/api/projects/${projectId}/keys/${key.id}`, world.dev),
      projectId,
      key.id,
      world.deps,
    );

    expect(response.status).toBe(200);
    const list = await handleListApiKeys(
      request("GET", `/api/projects/${projectId}/keys`, world.dev),
      projectId,
      world.deps,
    );
    const listed = (await list.json()) as { revokedAt: string | null }[];
    expect(listed[0].revokedAt).not.toBeNull();
  });

  it("returns 403 when another Developer revokes a key", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);
    const key = await issueKey(world, projectId, world.dev);

    const response = await handleRevokeApiKey(
      request("DELETE", `/api/projects/${projectId}/keys/${key.id}`, world.otherDev),
      projectId,
      key.id,
      world.deps,
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when revoking a key from a different project", async () => {
    const world = await setup();
    const firstProject = await projectIdFor(world, world.admin);
    const secondProject = await projectIdFor(world, world.admin);
    const key = await issueKey(world, firstProject, world.admin);

    const response = await handleRevokeApiKey(
      request("DELETE", `/api/projects/${secondProject}/keys/${key.id}`, world.admin),
      secondProject,
      key.id,
      world.deps,
    );

    expect(response.status).toBe(404);
  });
});

describe("reporting key authentication", () => {
  it("accepts an active key and returns its project", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);
    const key = await issueKey(world, projectId, world.dev);

    const result = await authenticateApiKey(bearer(key.key), world.deps.projects);

    expect(result).toEqual({ keyId: key.id, projectId });
  });

  it("returns 401 for a revoked key", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);
    const key = await issueKey(world, projectId, world.dev);
    await handleRevokeApiKey(
      request("DELETE", `/api/projects/${projectId}/keys/${key.id}`, world.dev),
      projectId,
      key.id,
      world.deps,
    );

    const result = await authenticateApiKey(bearer(key.key), world.deps.projects);

    expect(result instanceof Response && result.status).toBe(401);
  });

  it("returns 401 for an unknown key", async () => {
    const world = await setup();

    const result = await authenticateApiKey(bearer("tl_not-a-real-key"), world.deps.projects);

    expect(result instanceof Response && result.status).toBe(401);
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const world = await setup();

    const result = await authenticateApiKey(
      new Request("http://localhost/api/v1/events", { method: "POST" }),
      world.deps.projects,
    );

    expect(result instanceof Response && result.status).toBe(401);
  });
});

describe("project pages", () => {
  it("lists each organization with its projects and whether the user can create one", async () => {
    const world = await setup();
    await projectIdFor(world, world.dev);

    const devView = await listProjectsForUser(world.dev.id, world.deps);
    const viewerView = await listProjectsForUser(world.viewer.id, world.deps);
    const outsiderView = await listProjectsForUser(world.outsider.id, world.deps);

    expect(devView).toHaveLength(1);
    expect(devView[0].role).toBe("DEVELOPER");
    expect(devView[0].canCreateProject).toBe(true);
    expect(devView[0].projects.map((project) => project.name)).toEqual(["Support agent"]);
    expect(viewerView[0].canCreateProject).toBe(false);
    expect(outsiderView).toEqual([]);
  });

  it("loads a project's keys without the hash and says who can manage them", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);
    await issueKey(world, projectId, world.dev);

    const owner = await loadKeysPage(world.dev.id, projectId, world.deps);
    const otherDev = await loadKeysPage(world.otherDev.id, projectId, world.deps);
    const viewer = await loadKeysPage(world.viewer.id, projectId, world.deps);

    expect(owner?.project.name).toBe("Support agent");
    expect(owner?.canManageKeys).toBe(true);
    expect(owner?.keys).toHaveLength(1);
    expect(owner?.keys[0]).not.toHaveProperty("keyHash");
    expect(otherDev?.canManageKeys).toBe(false);
    expect(viewer?.canManageKeys).toBe(false);
  });

  it("returns nothing for a non-member opening a project's keys", async () => {
    const world = await setup();
    const projectId = await projectIdFor(world, world.dev);

    expect(await loadKeysPage(world.outsider.id, projectId, world.deps)).toBeNull();
  });
});
