import { authorize, type Role } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import type { UserRepository } from "@/lib/auth/user-repository";
import { errorResponse, readJson } from "@/lib/http";
import { addMemberSchema, changeRoleSchema, createOrganizationSchema } from "@/lib/schemas/organizations";
import { DuplicateMemberError, type OrganizationRepository } from "@/lib/services/organization-repository";

export type OrganizationDependencies = {
  users: UserRepository;
  orgs: OrganizationRepository;
  secret: string;
};

export async function handleCreateOrganization(
  request: Request,
  deps: OrganizationDependencies,
): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const input = await readJson(request, createOrganizationSchema);
  if (input instanceof Response) return input;

  const organization = await deps.orgs.createWithAdmin(input.name, { id: user.sub, email: user.email });
  return Response.json({ ...organization, role: "ADMIN" }, { status: 201 });
}

export async function handleGetOrganization(
  request: Request,
  orgId: string,
  deps: OrganizationDependencies,
): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const role = await deps.orgs.findRole(orgId, user.sub);
  const denied = authorize(role, "readOrganization");
  if (denied) return denied;

  const organization = await deps.orgs.findById(orgId);
  if (!organization) return errorResponse(404, "Organization not found");
  const members = await deps.orgs.listMembers(orgId);
  return Response.json({ ...organization, role, members });
}

export async function handleAddMember(
  request: Request,
  orgId: string,
  deps: OrganizationDependencies,
): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const denied = authorize(await deps.orgs.findRole(orgId, user.sub), "manageMembers");
  if (denied) return denied;
  const input = await readJson(request, addMemberSchema);
  if (input instanceof Response) return input;

  const invitee = await deps.users.findByEmail(input.email);
  if (!invitee) return errorResponse(404, "No account uses that email");

  try {
    const member = await deps.orgs.addMember(orgId, {
      userId: invitee.id,
      email: invitee.email,
      role: input.role,
    });
    return Response.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateMemberError) return errorResponse(409, "User is already a member");
    throw error;
  }
}

export async function handleChangeRole(
  request: Request,
  orgId: string,
  userId: string,
  deps: OrganizationDependencies,
): Promise<Response> {
  const user = await requireUser(request, deps.secret);
  if (user instanceof Response) return user;
  const denied = authorize(await deps.orgs.findRole(orgId, user.sub), "manageMembers");
  if (denied) return denied;
  const input = await readJson(request, changeRoleSchema);
  if (input instanceof Response) return input;

  const members = await deps.orgs.listMembers(orgId);
  const target = members.find((member) => member.userId === userId);
  if (!target) return errorResponse(404, "Member not found");
  if (isLastAdmin(members, target.userId) && input.role !== "ADMIN") {
    return errorResponse(409, "An organization needs at least one Admin");
  }

  const member = await deps.orgs.updateRole(orgId, userId, input.role);
  return Response.json(member);
}

function isLastAdmin(members: { userId: string; role: Role }[], userId: string): boolean {
  const admins = members.filter((member) => member.role === "ADMIN");
  return admins.length === 1 && admins[0].userId === userId;
}
