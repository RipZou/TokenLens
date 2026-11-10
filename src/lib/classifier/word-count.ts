import type { CountTokens } from "@/lib/classifier/types";

export const countWords: CountTokens = (text) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};
