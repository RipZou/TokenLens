import { INPUT_CATEGORIES, type InputCategory } from "@/lib/classifier/types";

export const CATEGORY_COLORS: Record<InputCategory, string> = {
  system: "#4C6EF5",
  tool_definitions: "#F08C00",
  history: "#7048E8",
  tool_results: "#0CA678",
  retrieval: "#D6336C",
  user_input: "#1864AB",
  attachments: "#868E96",
  overhead: "#CED4DA",
};

export const RANGE_LABELS = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
} as const;

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function formatCallTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function categoryNames(): readonly InputCategory[] {
  return INPUT_CATEGORIES;
}
