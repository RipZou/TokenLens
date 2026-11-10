import { countWords } from "@/lib/classifier/word-count";
import { classify } from "@/lib/classifier/classify";
import { INPUT_CATEGORIES, type CountTokens, type OutputCounts } from "@/lib/classifier/types";
import { costMicros, formatUsd } from "@/lib/budgets/money";
import { errorResponse } from "@/lib/http";
import { ingestEventSchema } from "@/lib/schemas/events";
import type { BudgetRepository } from "@/lib/services/budget-repository";
import { priceForEvent, recordBudgetAlerts } from "@/lib/services/budgets";
import { DuplicateEventError, type EventRepository } from "@/lib/services/event-repository";
import { authenticateApiKey } from "@/lib/services/projects";
import type { ProjectRepository } from "@/lib/services/project-repository";
import { INGEST_RATE_LIMIT, MAX_INGEST_BODY_BYTES, type RateLimiter } from "@/lib/services/rate-limit";

export { INGEST_RATE_LIMIT };

const OUTPUT_CATEGORIES = ["text", "thinking", "tool_use"] as const satisfies readonly (keyof OutputCounts)[];

export type IngestDependencies = {
  projects: ProjectRepository;
  events: EventRepository;
  rateLimiter: RateLimiter;
  budgets?: BudgetRepository;
  now?: () => Date;
  countTokens?: CountTokens;
};

export async function handleIngestEvent(request: Request, deps: IngestDependencies): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INGEST_BODY_BYTES) {
    return errorResponse(413, "Request body exceeds 1 MB");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_INGEST_BODY_BYTES) {
    return errorResponse(413, "Request body exceeds 1 MB");
  }

  const auth = await authenticateApiKey(request, deps.projects);
  if (auth instanceof Response) return auth;

  const now = deps.now?.() ?? new Date();
  if (!deps.rateLimiter.allow(auth.keyId, now.getTime())) {
    return errorResponse(429, "Too many requests");
  }

  let parsed: unknown;
  try {
    parsed = raw.length === 0 ? undefined : JSON.parse(raw);
  } catch {
    return errorResponse(400, "Invalid request body");
  }
  const input = ingestEventSchema.safeParse(parsed);
  if (!input.success) return errorResponse(400, "Invalid request body");

  let breakdown;
  try {
    breakdown = classify(input.data.request, input.data.usage, input.data.provider, deps.countTokens ?? countWords);
  } catch {
    return errorResponse(400, "Invalid request body");
  }

  const price = deps.budgets ? await priceForEvent(input.data.model, deps.budgets) : null;
  const costUsd = price
    ? formatUsd(
        costMicros(
          {
            inputTokens: breakdown.usage.input_tokens,
            outputTokens: breakdown.usage.output_tokens,
            cacheReadTokens: breakdown.cache.cache_read_tokens,
            cacheWriteTokens: breakdown.cache.cache_write_tokens,
          },
          price,
        ),
      )
    : null;

  try {
    await deps.events.create({
      externalId: input.data.id,
      projectId: auth.projectId,
      agentName: input.data.agent,
      model: input.data.model,
      inputTokens: breakdown.usage.input_tokens,
      outputTokens: breakdown.usage.output_tokens,
      cacheReadTokens: breakdown.cache.cache_read_tokens,
      cacheWriteTokens: breakdown.cache.cache_write_tokens,
      estimated: breakdown.estimated,
      createdAt: now,
      costUsd,
      breakdowns: [
        ...INPUT_CATEGORIES.map((category) => ({
          direction: "input" as const,
          category,
          tokens: breakdown.input[category],
        })),
        ...OUTPUT_CATEGORIES.map((category) => ({
          direction: "output" as const,
          category,
          tokens: breakdown.output[category],
        })),
      ],
    });
  } catch (error) {
    if (error instanceof DuplicateEventError) return errorResponse(409, "Event ID already exists");
    throw error;
  }

  if (deps.budgets) {
    const project = await deps.projects.findById(auth.projectId);
    if (project) await recordBudgetAlerts(project.orgId, now, { projects: deps.projects, budgets: deps.budgets });
  }

  return Response.json(
    {
      id: input.data.id,
      projectId: auth.projectId,
      estimated: breakdown.estimated,
      input: breakdown.input,
      output: breakdown.output,
      cache: breakdown.cache,
      usage: breakdown.usage,
    },
    { status: 201 },
  );
}
