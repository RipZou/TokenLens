export const INPUT_CATEGORIES = [
  "system",
  "tool_definitions",
  "history",
  "tool_results",
  "retrieval",
  "user_input",
  "attachments",
  "overhead",
] as const;

export type InputCategory = (typeof INPUT_CATEGORIES)[number];

export type InputCounts = Record<InputCategory, number>;

export type OutputCounts = {
  text: number;
  thinking: number;
  tool_use: number;
};

export type ProviderUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

export type Breakdown = {
  input: InputCounts;
  output: OutputCounts;
  cache: {
    cache_read_tokens: number;
    cache_write_tokens: number;
  };
  estimated: boolean;
  raw: InputCounts;
  usage: ProviderUsage;
};

export type CountTokens = (text: string) => number;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyCounts(): InputCounts {
  return {
    system: 0,
    tool_definitions: 0,
    history: 0,
    tool_results: 0,
    retrieval: 0,
    user_input: 0,
    attachments: 0,
    overhead: 0,
  };
}

export function emptyOutput(): OutputCounts {
  return { text: 0, thinking: 0, tool_use: 0 };
}

export function sumCounts(counts: InputCounts): number {
  let total = 0;
  for (const category of INPUT_CATEGORIES) total += counts[category];
  return total;
}
