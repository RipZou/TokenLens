import { getOrganizationRepository } from "@/lib/db/organization-repository";
import { getUserRepository } from "@/lib/db/user-repository";
import type { OrganizationDependencies } from "@/lib/services/organizations";

export function organizationDependencies(): OrganizationDependencies | Response {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return Response.json({ error: "Server is missing JWT_SECRET" }, { status: 500 });
  }
  return {
    users: getUserRepository(),
    orgs: getOrganizationRepository(),
    secret,
  };
}
