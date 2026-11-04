import type { Role } from "@/lib/auth/permissions";

export type OrganizationRecord = {
  id: string;
  name: string;
};

export type MemberRecord = {
  userId: string;
  email: string;
  role: Role;
};

export class DuplicateMemberError extends Error {
  constructor() {
    super("User is already a member");
    this.name = "DuplicateMemberError";
  }
}

export interface OrganizationRepository {
  createWithAdmin(name: string, admin: { id: string; email: string }): Promise<OrganizationRecord>;
  findById(orgId: string): Promise<OrganizationRecord | null>;
  findRole(orgId: string, userId: string): Promise<Role | null>;
  listMembers(orgId: string): Promise<MemberRecord[]>;
  addMember(orgId: string, member: MemberRecord): Promise<MemberRecord>;
  updateRole(orgId: string, userId: string, role: Role): Promise<MemberRecord>;
}
