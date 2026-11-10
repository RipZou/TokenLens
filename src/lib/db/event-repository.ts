import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateEventError();
      }
      throw error;
    }
  }
}

export function getEventRepository(): EventRepository {
  return new PrismaEventRepository(getPrisma());
}
