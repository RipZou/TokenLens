import { randomUUID } from "node:crypto";
import type { Role } from "@/lib/auth/permissions";
import {
  DuplicateMemberError,
  type MemberRecord,
  type OrganizationRecord,
  type OrganizationRepository,
} from "@/lib/services/organization-repository";

export class MemoryOrganizationRepository implements OrganizationRepository {
  private readonly organizations = new Map<string, OrganizationRecord>();
  private readonly members = new Map<string, MemberRecord[]>();

  async createWithAdmin(name: string, admin: { id: string; email: string }): Promise<OrganizationRecord> {
    const organization = { id: randomUUID(), name };
    this.organizations.set(organization.id, organization);
    this.members.set(organization.id, [{ userId: admin.id, email: admin.email, role: "ADMIN" }]);
    return organization;
  }

  async findById(orgId: string): Promise<OrganizationRecord | null> {
    return this.organizations.get(orgId) ?? null;
  }

  async findRole(orgId: string, userId: string): Promise<Role | null> {
    return this.members.get(orgId)?.find((member) => member.userId === userId)?.role ?? null;
  }

  async listMembers(orgId: string): Promise<MemberRecord[]> {
    return [...(this.members.get(orgId) ?? [])];
  }

  async addMember(orgId: string, member: MemberRecord): Promise<MemberRecord> {
    const members = this.members.get(orgId) ?? [];
    if (members.some((existing) => existing.userId === member.userId)) {
      throw new DuplicateMemberError();
    }
    members.push(member);
    this.members.set(orgId, members);
    return member;
  }

  async updateRole(orgId: string, userId: string, role: Role): Promise<MemberRecord> {
    const member = this.members.get(orgId)?.find((existing) => existing.userId === userId);
    if (!member) throw new Error("Member not found");
    member.role = role;
    return member;
  }
}
