import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { isUuid } from "@/lib/db/uuid";
import type {
  ApiKeyRecord,
  NewApiKey,
  ProjectRecord,
  ProjectRepository,
} from "@/lib/services/project-repository";

const PROJECT_FIELDS = { id: true, orgId: true, name: true, createdBy: true } as const;

export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: Omit<ProjectRecord, "id">): Promise<ProjectRecord> {
    return this.db.project.create({ data: input, select: PROJECT_FIELDS });
  }

  async findById(projectId: string): Promise<ProjectRecord | null> {
    if (!isUuid(projectId)) return null;
    return this.db.project.findUnique({ where: { id: projectId }, select: PROJECT_FIELDS });
  }

  async listByOrg(orgId: string): Promise<ProjectRecord[]> {
    return this.db.project.findMany({ where: { orgId }, select: PROJECT_FIELDS, orderBy: { createdAt: "asc" } });
  }

  async createKey(input: NewApiKey): Promise<ApiKeyRecord> {
    return this.db.apiKey.create({ data: input });
  }

  async listKeys(projectId: string): Promise<ApiKeyRecord[]> {
    return this.db.apiKey.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  }

  async findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.db.apiKey.findUnique({ where: { keyHash } });
  }

  async revokeKey(projectId: string, keyId: string): Promise<ApiKeyRecord | null> {
    if (!isUuid(keyId)) return null;
    await this.db.apiKey.updateMany({
      where: { id: keyId, projectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.db.apiKey.findFirst({ where: { id: keyId, projectId } });
  }
}

export function getProjectRepository(): ProjectRepository {
  return new PrismaProjectRepository(getPrisma());
}
