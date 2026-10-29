import { calibrate } from "./calibrate";
import { allocateAnthropic } from "./parse-anthropic";
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
  if (provider !== "anthropic") {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  if (typeof countTokens !== "function") {
    throw new Error("countTokens is required");
  }

  const providerUsage = readUsage(usage);
  if (!isRecord(request)) {
    throw new Error("Invalid request");
  }

  const raw = allocateAnthropic(request, countTokens);
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

  return {
    input_tokens: requiredCount(usage, "input_tokens"),
    output_tokens: optionalCount(usage, ["output_tokens"]),
    cache_read_tokens: optionalCount(usage, ["cache_read_input_tokens", "cache_read_tokens"]),
    cache_write_tokens: optionalCount(usage, ["cache_creation_input_tokens", "cache_write_tokens"]),
  };
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
