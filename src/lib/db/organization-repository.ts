import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/lib/auth/permissions";
import { getPrisma } from "@/lib/db/prisma";
import { isUuid } from "@/lib/db/uuid";
import {
  DuplicateMemberError,
  type MemberRecord,
  type OrganizationRecord,
  type OrganizationRepository,
} from "@/lib/services/organization-repository";

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: PrismaClient) {}

  async createWithAdmin(name: string, admin: { id: string; email: string }): Promise<OrganizationRecord> {
    const row = await this.db.organization.create({
      data: { name, memberships: { create: { userId: admin.id, role: "ADMIN" } } },
    });
    return { id: row.id, name: row.name };
  }

  async findById(orgId: string): Promise<OrganizationRecord | null> {
    if (!isUuid(orgId)) return null;
    const row = await this.db.organization.findUnique({ where: { id: orgId } });
    return row ? { id: row.id, name: row.name } : null;
  }

  async findRole(orgId: string, userId: string): Promise<Role | null> {
    if (!isUuid(orgId) || !isUuid(userId)) return null;
    const row = await this.db.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
    return row?.role ?? null;
  }

  async listMembers(orgId: string): Promise<MemberRecord[]> {
    if (!isUuid(orgId)) return [];
    const rows = await this.db.membership.findMany({
      where: { orgId },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({ userId: row.userId, email: row.user.email, role: row.role }));
  }

  async addMember(orgId: string, member: MemberRecord): Promise<MemberRecord> {
    try {
      await this.db.membership.create({ data: { orgId, userId: member.userId, role: member.role } });
      return member;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateMemberError();
      }
      throw error;
    }
  }

  async updateRole(orgId: string, userId: string, role: Role): Promise<MemberRecord> {
    const row = await this.db.membership.update({
      where: { userId_orgId: { userId, orgId } },
      data: { role },
      include: { user: { select: { email: true } } },
    });
    return { userId: row.userId, email: row.user.email, role: row.role };
  }
}

export function getOrganizationRepository(): OrganizationRepository {
  return new PrismaOrganizationRepository(getPrisma());
}
