import { describe, expect, it } from "vitest";
import { MemoryUserRepository } from "@/lib/auth/memory-user-repository";
import { authorize, can } from "@/lib/auth/permissions";
import { signSession } from "@/lib/auth/session";
import { MemoryOrganizationRepository } from "@/lib/services/memory-organization-repository";
import {
  handleAddMember,
  handleChangeRole,
  handleCreateOrganization,
  handleGetOrganization,
  type OrganizationDependencies,
} from "@/lib/services/organizations";

const SECRET = "test-secret-that-is-long-enough-for-hs256";

type TestUser = { id: string; email: string; cookie: string };

function setup(): OrganizationDependencies {
  return {
    users: new MemoryUserRepository(),
    orgs: new MemoryOrganizationRepository(),
    secret: SECRET,
  };
}

async function signUp(deps: OrganizationDependencies, email: string): Promise<TestUser> {
  const user = await deps.users.create({ email, passwordHash: "$2b$12$hash" });
  const token = await signSession({ sub: user.id, email: user.email }, SECRET);
  return { id: user.id, email: user.email, cookie: `tokenlens_session=${token}` };
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

async function createOrg(deps: OrganizationDependencies, admin: TestUser): Promise<string> {
  const response = await handleCreateOrganization(
    request("POST", "/api/orgs", admin, { name: "Acme AI" }),
    deps,
  );
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function addMember(
  deps: OrganizationDependencies,
  orgId: string,
  admin: TestUser,
  member: TestUser,
  role: string,
): Promise<Response> {
  return handleAddMember(
    request("POST", `/api/orgs/${orgId}/members`, admin, { email: member.email, role }),
    orgId,
    deps,
  );
}

describe("organizations", () => {
  it("creates an organization and makes the creator its Admin", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");

    const response = await handleCreateOrganization(
      request("POST", "/api/orgs", admin, { name: "Acme AI" }),
      deps,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string; role: string };
    expect(body.name).toBe("Acme AI");
    expect(body.role).toBe("ADMIN");
  });

  it("returns 401 when creating an organization without a session", async () => {
    const deps = setup();

    const response = await handleCreateOrganization(
      request("POST", "/api/orgs", null, { name: "Acme AI" }),
      deps,
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a blank organization name", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");

    const response = await handleCreateOrganization(
      request("POST", "/api/orgs", admin, { name: "   " }),
      deps,
    );

    expect(response.status).toBe(400);
  });
});

describe("members and roles", () => {
  it("lets an Admin invite a registered user with a role", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const dev = await signUp(deps, "dev@example.com");
    const orgId = await createOrg(deps, admin);

    const response = await addMember(deps, orgId, admin, dev, "DEVELOPER");

    expect(response.status).toBe(201);
    const org = await handleGetOrganization(request("GET", `/api/orgs/${orgId}`, dev), orgId, deps);
    expect(org.status).toBe(200);
    const body = (await org.json()) as { role: string; members: { email: string; role: string }[] };
    expect(body.role).toBe("DEVELOPER");
    expect(body.members).toEqual(
      expect.arrayContaining([
        { userId: admin.id, email: "admin@example.com", role: "ADMIN" },
        { userId: dev.id, email: "dev@example.com", role: "DEVELOPER" },
      ]),
    );
  });

  it("returns 403 when a Developer tries to invite a member", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const dev = await signUp(deps, "dev@example.com");
    const viewer = await signUp(deps, "viewer@example.com");
    const orgId = await createOrg(deps, admin);
    await addMember(deps, orgId, admin, dev, "DEVELOPER");

    const response = await addMember(deps, orgId, dev, viewer, "VIEWER");

    expect(response.status).toBe(403);
  });

  it("returns 400 for an unknown role", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const dev = await signUp(deps, "dev@example.com");
    const orgId = await createOrg(deps, admin);

    const response = await addMember(deps, orgId, admin, dev, "OWNER");

    expect(response.status).toBe(400);
  });

  it("returns 404 when inviting an email with no account", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const orgId = await createOrg(deps, admin);

    const response = await handleAddMember(
      request("POST", `/api/orgs/${orgId}/members`, admin, {
        email: "nobody@example.com",
        role: "VIEWER",
      }),
      orgId,
      deps,
    );

    expect(response.status).toBe(404);
  });

  it("returns 409 when inviting someone who is already a member", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const dev = await signUp(deps, "dev@example.com");
    const orgId = await createOrg(deps, admin);
    await addMember(deps, orgId, admin, dev, "DEVELOPER");

    const response = await addMember(deps, orgId, admin, dev, "VIEWER");

    expect(response.status).toBe(409);
  });

  it("lets an Admin change a member's role", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const dev = await signUp(deps, "dev@example.com");
    const orgId = await createOrg(deps, admin);
    await addMember(deps, orgId, admin, dev, "DEVELOPER");

    const response = await handleChangeRole(
      request("PATCH", `/api/orgs/${orgId}/members/${dev.id}`, admin, { role: "VIEWER" }),
      orgId,
      dev.id,
      deps,
    );

    expect(response.status).toBe(200);
    const org = await handleGetOrganization(request("GET", `/api/orgs/${orgId}`, dev), orgId, deps);
    const body = (await org.json()) as { role: string };
    expect(body.role).toBe("VIEWER");
  });

  it("returns 403 when a Viewer tries to change a role", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const viewer = await signUp(deps, "viewer@example.com");
    const orgId = await createOrg(deps, admin);
    await addMember(deps, orgId, admin, viewer, "VIEWER");

    const response = await handleChangeRole(
      request("PATCH", `/api/orgs/${orgId}/members/${viewer.id}`, viewer, { role: "ADMIN" }),
      orgId,
      viewer.id,
      deps,
    );

    expect(response.status).toBe(403);
  });

  it("returns 409 when the last Admin would be demoted", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const orgId = await createOrg(deps, admin);

    const response = await handleChangeRole(
      request("PATCH", `/api/orgs/${orgId}/members/${admin.id}`, admin, { role: "VIEWER" }),
      orgId,
      admin.id,
      deps,
    );

    expect(response.status).toBe(409);
  });
});

describe("tenant isolation", () => {
  it("returns 403 when a non-member reads an organization", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const outsider = await signUp(deps, "outsider@example.com");
    const orgId = await createOrg(deps, admin);

    const response = await handleGetOrganization(
      request("GET", `/api/orgs/${orgId}`, outsider),
      orgId,
      deps,
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when a non-member tries to invite into an organization", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const outsider = await signUp(deps, "outsider@example.com");
    const orgId = await createOrg(deps, admin);

    const response = await addMember(deps, orgId, outsider, outsider, "ADMIN");

    expect(response.status).toBe(403);
  });

  it("returns 401 when reading an organization without a session", async () => {
    const deps = setup();
    const admin = await signUp(deps, "admin@example.com");
    const orgId = await createOrg(deps, admin);

    const response = await handleGetOrganization(request("GET", `/api/orgs/${orgId}`, null), orgId, deps);

    expect(response.status).toBe(401);
  });
});

describe("role permissions", () => {
  it("matches the role table", () => {
    expect(can("ADMIN", "createProject")).toBe(true);
    expect(can("DEVELOPER", "createProject")).toBe(true);
    expect(can("VIEWER", "createProject")).toBe(false);
    expect(can("VIEWER", "readOrganization")).toBe(true);
    expect(can("DEVELOPER", "manageMembers")).toBe(false);
    expect(can("DEVELOPER", "configureBudgets")).toBe(false);
    expect(can("DEVELOPER", "editModelPrices")).toBe(false);
    expect(can("ADMIN", "manageMembers")).toBe(true);
  });

  it("returns 403 when a Viewer attempts to create a project", async () => {
    const response = authorize("VIEWER", "createProject");

    expect(response?.status).toBe(403);
  });

  it("allows a Developer to create a project", () => {
    expect(authorize("DEVELOPER", "createProject")).toBeNull();
  });
});
