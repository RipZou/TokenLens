import { isRecord } from "@/lib/classifier/types";
import type { CountTokens } from "@/lib/classifier/types";

const SKIPPED_KEYS = new Set(["type", "id", "role", "model", "tool_use_id", "tool_call_id", "tl_category"]);

const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["orders", /\b(order|orders|shipment|refund)\b/i],
  ["support", /\b(help|policy|account)\b/i],
];

export type TopicCount = { topic: string; tokens: number };

export function topicFor(text: string): string {
  for (const [topic, pattern] of RULES) {
    if (pattern.test(text)) return topic;
  }
  return "general";
}

export function tagRequest(
  request: unknown,
  countTokens: CountTokens,
  topicOf: (text: string) => string = topicFor,
): TopicCount[] {
  const totals = new Map<string, number>();
  walk(request, (text) => {
    const tokens = countTokens(text);
    if (!Number.isInteger(tokens) || tokens <= 0) return;
    const topic = topicOf(text);
    totals.set(topic, (totals.get(topic) ?? 0) + tokens);
  });
  return [...totals.entries()]
    .map(([topic, tokens]) => ({ topic, tokens }))
    .sort((left, right) => left.topic.localeCompare(right.topic));
}

function walk(value: unknown, visit: (text: string) => void): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (SKIPPED_KEYS.has(key)) continue;
    walk(child, visit);
  }
}
