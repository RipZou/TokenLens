export type ProjectRecord = {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
};

export type ApiKeyRecord = {
  id: string;
  projectId: string;
  keyHash: string;
  prefix: string;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
};

export type NewApiKey = Pick<ApiKeyRecord, "projectId" | "keyHash" | "prefix" | "createdBy">;

export interface ProjectRepository {
  create(input: Omit<ProjectRecord, "id">): Promise<ProjectRecord>;
  findById(projectId: string): Promise<ProjectRecord | null>;
  listByOrg(orgId: string): Promise<ProjectRecord[]>;
  createKey(input: NewApiKey): Promise<ApiKeyRecord>;
  listKeys(projectId: string): Promise<ApiKeyRecord[]>;
  findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  revokeKey(projectId: string, keyId: string): Promise<ApiKeyRecord | null>;
}
