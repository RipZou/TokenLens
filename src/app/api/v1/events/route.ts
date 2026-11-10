import { getBudgetRepository } from "@/lib/db/budget-repository";
import { getEventRepository } from "@/lib/db/event-repository";
import { getProjectRepository } from "@/lib/db/project-repository";
import { handleIngestEvent, type IngestDependencies } from "@/lib/services/events";
import { MemoryRateLimiter } from "@/lib/services/rate-limit";

const rateLimiter = new MemoryRateLimiter();

export function ingestDependencies(): IngestDependencies {
  return {
    projects: getProjectRepository(),
    events: getEventRepository(),
    budgets: getBudgetRepository(),
    rateLimiter,
  };
}

export async function POST(request: Request): Promise<Response> {
  return handleIngestEvent(request, ingestDependencies());
}
