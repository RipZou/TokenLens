import { randomUUID } from "node:crypto";
import type {
  ApiKeyRecord,
  NewApiKey,
  ProjectRecord,
  ProjectRepository,
} from "@/lib/services/project-repository";

export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly keys: ApiKeyRecord[] = [];

  async create(input: Omit<ProjectRecord, "id">): Promise<ProjectRecord> {
    const project = { id: randomUUID(), ...input };
    this.projects.set(project.id, project);
    return project;
  }

  async findById(projectId: string): Promise<ProjectRecord | null> {
    return this.projects.get(projectId) ?? null;
  }

  async listByOrg(orgId: string): Promise<ProjectRecord[]> {
    return [...this.projects.values()].filter((project) => project.orgId === orgId);
  }

  async createKey(input: NewApiKey): Promise<ApiKeyRecord> {
    const key = { id: randomUUID(), ...input, createdAt: new Date(), revokedAt: null };
    this.keys.push(key);
    return key;
  }

  async listKeys(projectId: string): Promise<ApiKeyRecord[]> {
    return this.keys.filter((key) => key.projectId === projectId);
  }

  async findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.keys.find((key) => key.keyHash === keyHash) ?? null;
  }

  async revokeKey(projectId: string, keyId: string): Promise<ApiKeyRecord | null> {
    const key = this.keys.find((candidate) => candidate.id === keyId && candidate.projectId === projectId);
    if (!key) return null;
    key.revokedAt ??= new Date();
    return key;
  }
}
