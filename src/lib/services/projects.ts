import { generateApiKey, hashApiKey } from "@/lib/auth/api-keys";
import { authorize, can, type Role } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, forbidden, readJson } from "@/lib/http";
import { createProjectSchema } from "@/lib/schemas/projects";
import type { OrganizationRepository } from "@/lib/services/organization-repository";
import type { ApiKeyRecord, ProjectRecord, ProjectRepository } from "@/lib/services/project-repository";

export type ProjectDependencies = {
  orgs: OrganizationRepository;
  projects: ProjectRepository;
  secret: string;
};

type ProjectAccess = { userId: string; project: ProjectRecord; role: Role };

function publicKey(key: ApiKeyRecord) {
  return { id: key.id, prefix: key.prefix, createdAt: key.createdAt, revokedAt: key.revokedAt };
}

async function findProjectAccess(
  userId: string,
  projectId: string,
  deps: ProjectDependencies,
): Promise<ProjectAccess | null> {
  const project = await deps.projects.findById(projectId);
  const role = project ? await deps.orgs.findRole(project.orgId, userId) : null;
  return project && role ? { userId, project, role } : null;
}

async function projectAccess(
  request: Request,
  projectId: string,
  deps: ProjectDependencies,
): Promise<ProjectAccess | Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  return (await findProjectAccess(user.sub, projectId, deps)) ?? forbidden();
}

function canManageKeys({ userId, project, role }: ProjectAccess): boolean {
  if (!can(role, "manageApiKeys")) return false;
  return role !== "DEVELOPER" || project.createdBy === userId;
}

export async function handleCreateProject(
  request: Request,
  orgId: string,
  deps: ProjectDependencies,
): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const denied = authorize(await deps.orgs.findRole(orgId, user.sub), "createProject");
  if (denied) return denied;
  const input = await readJson(request, createProjectSchema);
  if (input instanceof Response) return input;

  const project = await deps.projects.create({ orgId, name: input.name, createdBy: user.sub });
  return Response.json({ id: project.id, name: project.name, orgId: project.orgId }, { status: 201 });
}

export async function handleCreateApiKey(
  request: Request,
  projectId: string,
  deps: ProjectDependencies,
): Promise<Response> {
  const access = await projectAccess(request, projectId, deps);
  if (access instanceof Response) return access;
  if (!canManageKeys(access)) return forbidden();

  const { key, prefix, keyHash } = generateApiKey();
  const record = await deps.projects.createKey({ projectId, keyHash, prefix, createdBy: access.userId });
  return Response.json({ ...publicKey(record), key }, { status: 201 });
}

export async function handleListApiKeys(
  request: Request,
  projectId: string,
  deps: ProjectDependencies,
): Promise<Response> {
  const access = await projectAccess(request, projectId, deps);
  if (access instanceof Response) return access;

  const keys = await deps.projects.listKeys(projectId);
  return Response.json(keys.map(publicKey));
}

export async function handleRevokeApiKey(
  request: Request,
  projectId: string,
  keyId: string,
  deps: ProjectDependencies,
): Promise<Response> {
  const access = await projectAccess(request, projectId, deps);
  if (access instanceof Response) return access;
  if (!canManageKeys(access)) return forbidden();

  const key = await deps.projects.revokeKey(projectId, keyId);
  if (!key) return errorResponse(404, "API key not found");
  return Response.json(publicKey(key));
}

export async function authenticateApiKey(
  request: Request,
  projects: ProjectRepository,
): Promise<{ keyId: string; projectId: string } | Response> {
  const match = /^Bearer\s+(\S+)$/.exec(request.headers.get("authorization") ?? "");
  const key = match ? await projects.findKeyByHash(hashApiKey(match[1])) : null;
  if (!key || key.revokedAt) return errorResponse(401, "Invalid or revoked API key");
  return { keyId: key.id, projectId: key.projectId };
}

export async function listProjectsForUser(userId: string, deps: ProjectDependencies) {
  const memberships = await deps.orgs.listForUser(userId);
  return Promise.all(
    memberships.map(async (membership) => ({
      ...membership,
      canCreateProject: can(membership.role, "createProject"),
      projects: (await deps.projects.listByOrg(membership.id)).map(({ id, name }) => ({ id, name })),
    })),
  );
}

export async function loadKeysPage(userId: string, projectId: string, deps: ProjectDependencies) {
  const access = await findProjectAccess(userId, projectId, deps);
  if (!access) return null;
  const keys = await deps.projects.listKeys(projectId);
  return {
    project: { id: access.project.id, name: access.project.name, orgId: access.project.orgId },
    canManageKeys: canManageKeys(access),
    keys: keys.map(publicKey),
  };
}
