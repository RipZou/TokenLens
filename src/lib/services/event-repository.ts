export type BreakdownDirection = "input" | "output";

export type BreakdownRow = {
  direction: BreakdownDirection;
  category: string;
  tokens: number;
};

export type NewEvent = {
  externalId: string;
  projectId: string;
  agentName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimated: boolean;
  createdAt: Date;
  costUsd: string | null;
  breakdowns: BreakdownRow[];
};

export type StoredEvent = NewEvent & { id: string };

export class DuplicateEventError extends Error {
  constructor() {
    super("Event ID already exists");
    this.name = "DuplicateEventError";
  }
}

export interface EventRepository {
  create(input: NewEvent): Promise<StoredEvent>;
  listInRange(projectIds: string[], since: Date): Promise<StoredEvent[]>;
  findInProjects(id: string, projectIds: string[]): Promise<StoredEvent | null>;
}
