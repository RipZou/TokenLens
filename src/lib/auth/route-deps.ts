import type { AuthDependencies } from "@/lib/auth/handlers";
import { getOrganizationRepository } from "@/lib/db/organization-repository";
import { getProjectRepository } from "@/lib/db/project-repository";
import { getUserRepository } from "@/lib/db/user-repository";
import type { OrganizationDependencies } from "@/lib/services/organizations";
import type { ProjectDependencies } from "@/lib/services/projects";

export function authDependencies(): AuthDependencies | Response {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return Response.json({ error: "Server is missing JWT_SECRET" }, { status: 500 });
  }
  return {
    users: getUserRepository(),
    orgs: getOrganizationRepository(),
    secret,
    secure: process.env.NODE_ENV === "production",
  };
}

export function organizationDependencies(): OrganizationDependencies | Response {
  const auth = authDependencies();
  if (auth instanceof Response) return auth;
  return { users: auth.users, orgs: auth.orgs, secret: auth.secret };
}

export function projectDependencies(): ProjectDependencies | Response {
  const auth = authDependencies();
  if (auth instanceof Response) return auth;
  return { orgs: auth.orgs, projects: getProjectRepository(), secret: auth.secret };
}
