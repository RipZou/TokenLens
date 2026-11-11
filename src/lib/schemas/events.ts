import { z } from "zod";

const tokenCount = z.number().int().nonnegative();

export const ingestEventSchema = z.object({
  id: z.string().trim().min(1).max(200),
  provider: z.enum(["anthropic", "openai"]),
  agent: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  request: z.unknown().refine((value) => typeof value === "object" && value !== null && !Array.isArray(value)),
  usage: z.object({
    input_tokens: tokenCount,
    output_tokens: tokenCount.optional(),
    cache_read_tokens: tokenCount.optional(),
    cache_write_tokens: tokenCount.optional(),
    cache_read_input_tokens: tokenCount.optional(),
    cache_creation_input_tokens: tokenCount.optional(),
  }),
  tagTopics: z.boolean().optional(),
});

export type IngestEventInput = z.infer<typeof ingestEventSchema>;
