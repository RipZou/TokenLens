import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { isUuid } from "@/lib/db/uuid";
import {
  DuplicateEventError,
  type EventRepository,
  type NewEvent,
  type StoredEvent,
} from "@/lib/services/event-repository";

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: NewEvent): Promise<StoredEvent> {
    try {
      const row = await this.db.event.create({
        data: {
          projectId: input.projectId,
          externalId: input.externalId,
          agentName: input.agentName,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          cacheReadTokens: input.cacheReadTokens,
          cacheWriteTokens: input.cacheWriteTokens,
          estimated: input.estimated,
          createdAt: input.createdAt,
          costUsd: input.costUsd,
          breakdowns: { create: input.breakdowns },
        },
        include: { breakdowns: true },
      });
      return toStored(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateEventError();
      }
      throw error;
    }
  }

  async listInRange(projectIds: string[], since: Date): Promise<StoredEvent[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.db.event.findMany({
      where: { projectId: { in: projectIds }, createdAt: { gte: since } },
      include: { breakdowns: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toStored);
  }

  async findInProjects(id: string, projectIds: string[]): Promise<StoredEvent | null> {
    if (projectIds.length === 0 || !isUuid(id)) return null;
    const row = await this.db.event.findFirst({
      where: { id, projectId: { in: projectIds } },
      include: { breakdowns: true },
    });
    return row ? toStored(row) : null;
  }
}

function toStored(row: {
  id: string;
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
  costUsd: { toFixed(digits: number): string } | null;
  breakdowns: { direction: "input" | "output"; category: string; tokens: number }[];
}): StoredEvent {
  return {
    id: row.id,
    externalId: row.externalId,
    projectId: row.projectId,
    agentName: row.agentName,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    estimated: row.estimated,
    createdAt: row.createdAt,
    costUsd: row.costUsd === null ? null : row.costUsd.toFixed(8),
    breakdowns: row.breakdowns.map((item) => ({
      direction: item.direction,
      category: item.category,
      tokens: item.tokens,
    })),
  };
}

export function getEventRepository(): EventRepository {
  return new PrismaEventRepository(getPrisma());
}
