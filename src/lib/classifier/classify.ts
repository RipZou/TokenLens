import { calibrate } from "./calibrate";
import { allocateAnthropic } from "./parse-anthropic";
import { allocateOpenAI } from "./parse-openai";
import {
  emptyOutput,
  isRecord,
  type Breakdown,
  type CountTokens,
  type ProviderUsage,
} from "./types";

export { INPUT_CATEGORIES } from "./types";
export type { Breakdown, CountTokens, InputCategory, InputCounts } from "./types";

export function classify(
  request: unknown,
  usage: unknown,
  provider: string,
  countTokens: CountTokens,
): Breakdown {
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  if (typeof countTokens !== "function") {
    throw new Error("countTokens is required");
  }

  const providerUsage = readUsage(usage);
  if (!isRecord(request)) {
    throw new Error("Invalid request");
  }

  const raw = provider === "openai" ? allocateOpenAI(request, countTokens) : allocateAnthropic(request, countTokens);
  const calibrated = calibrate(raw, providerUsage.input_tokens);

  return {
    input: calibrated.counts,
    output: emptyOutput(),
    cache: {
      cache_read_tokens: providerUsage.cache_read_tokens,
      cache_write_tokens: providerUsage.cache_write_tokens,
    },
    estimated: calibrated.estimated,
    raw: { ...raw },
    usage: providerUsage,
  };
}

function readUsage(usage: unknown): ProviderUsage {
  if (!isRecord(usage)) throw new Error("Invalid usage");
  const normalized = { ...usage };
  if (!Object.prototype.hasOwnProperty.call(normalized, "input_tokens") && isRecord(usage)) {
    if (Object.prototype.hasOwnProperty.call(usage, "prompt_tokens")) normalized.input_tokens = usage.prompt_tokens;
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "output_tokens") && Object.prototype.hasOwnProperty.call(usage, "completion_tokens")) {
    normalized.output_tokens = usage.completion_tokens;
  }

  return {
    input_tokens: requiredCount(normalized, "input_tokens"),
    output_tokens: optionalCount(normalized, ["output_tokens"]),
    cache_read_tokens: cacheReadCount(usage, normalized),
    cache_write_tokens: optionalCount(normalized, ["cache_creation_input_tokens", "cache_write_tokens"]),
  };
}

function cacheReadCount(usage: Record<string, unknown>, normalized: Record<string, unknown>): number {
  const direct = optionalCount(normalized, ["cache_read_input_tokens", "cache_read_tokens"]);
  if (direct > 0 || Object.prototype.hasOwnProperty.call(normalized, "cache_read_tokens") || Object.prototype.hasOwnProperty.call(normalized, "cache_read_input_tokens")) {
    return direct;
  }
  const details = usage.prompt_tokens_details;
  if (isRecord(details) && Object.prototype.hasOwnProperty.call(details, "cached_tokens")) {
    return nonnegativeInteger(details.cached_tokens, "cached_tokens");
  }
  return 0;
}

function requiredCount(usage: Record<string, unknown>, field: string): number {
  if (!Object.prototype.hasOwnProperty.call(usage, field)) {
    throw new Error(`Invalid usage: ${field} is required`);
  }
  return nonnegativeInteger(usage[field], field);
}

function optionalCount(usage: Record<string, unknown>, fields: string[]): number {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(usage, field) && usage[field] !== undefined) {
      return nonnegativeInteger(usage[field], field);
    }
  }
  return 0;
}

function nonnegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid usage: ${field} must be a nonnegative integer`);
  }
  return value;
}
