export function optimizationHints(
  input: { category: string; tokens: number }[],
  inputTokens: number,
): string[] {
  if (inputTokens <= 0) return [];
  const share = (category: string) => (input.find((item) => item.category === category)?.tokens ?? 0) / inputTokens;
  const hints: string[] = [];
  if (share("tool_definitions") > 0.4) hints.push("Tool definitions are over 40% of input.");
  if (share("history") > 0.5) hints.push("History is over 50% of input.");
  return hints;
}
