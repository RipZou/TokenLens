import { emptyCounts, isRecord, type CountTokens, type InputCounts } from "./types";

const STRUCTURAL_KEYS = new Set(["type", "id", "tool_use_id", "tl_category"]);

type TextDestination = "system" | "history" | "retrieval" | "user_input";

export function allocateAnthropic(request: Record<string, unknown>, countTokens: CountTokens): InputCounts {
  const tokensOf = bindCounter(countTokens);
  const counts = emptyCounts();

  if (request.system !== undefined) {
    counts.system += countStrings(request.system, tokensOf);
  }

  if (request.tools !== undefined) {
    if (!Array.isArray(request.tools)) {
      throw new Error("Invalid request: tools must be an array");
    }
    counts.tool_definitions += countStrings(request.tools, tokensOf);
  }

  assignMessages(request.messages, counts, tokensOf);
  return counts;
}

function bindCounter(countTokens: CountTokens): (text: string) => number {
  return (text) => {
    const count = countTokens(text);
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new Error("Invalid token count");
    }
    return count;
  };
}

function countStrings(value: unknown, tokensOf: (text: string) => number): number {
  if (typeof value === "string") return tokensOf(value);
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) total += countStrings(item, tokensOf);
    return total;
  }
  if (!isRecord(value)) return 0;

  let total = 0;
  for (const [key, child] of Object.entries(value)) {
    if (STRUCTURAL_KEYS.has(key)) continue;
    total += countStrings(child, tokensOf);
  }
  return total;
}

function assignMessages(
  messages: unknown,
  counts: InputCounts,
  tokensOf: (text: string) => number,
): void {
  if (messages === undefined) return;
  if (!Array.isArray(messages)) {
    throw new Error("Invalid request: messages must be an array");
  }

  let lastUserIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (isRecord(message) && message.role === "user") lastUserIndex = index;
  }

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!isRecord(message)) continue;

    let destination: TextDestination;
    if (message.role === "system" || message.role === "developer") destination = "system";
    else if (index === lastUserIndex) destination = "user_input";
    else destination = "history";

    if (message.tl_category === "retrieval") destination = "retrieval";
    assignContent(message.content, destination, counts, tokensOf);
  }
}

function assignContent(
  content: unknown,
  destination: TextDestination,
  counts: InputCounts,
  tokensOf: (text: string) => number,
): void {
  if (typeof content === "string") {
    counts[destination] += tokensOf(content);
    return;
  }
  if (Array.isArray(content)) {
    for (const block of content) assignBlock(block, destination, counts, tokensOf);
    return;
  }
  if (isRecord(content)) assignBlock(content, destination, counts, tokensOf);
}

function assignBlock(
  block: unknown,
  destination: TextDestination,
  counts: InputCounts,
  tokensOf: (text: string) => number,
): void {
  if (typeof block === "string") {
    counts[destination] += tokensOf(block);
    return;
  }
  if (!isRecord(block)) return;

  if (block.tl_category === "retrieval") {
    counts.retrieval += countStrings(block, tokensOf);
    return;
  }
  if (block.type === "tool_result") {
    assignToolResult(block, counts, tokensOf);
    return;
  }
  if (block.type === "image" || block.type === "document") {
    counts.attachments += countStrings(block, tokensOf);
    return;
  }
  counts[destination] += countStrings(block, tokensOf);
}

function assignToolResult(
  block: Record<string, unknown>,
  counts: InputCounts,
  tokensOf: (text: string) => number,
): void {
  const content = block.content;
  if (typeof content === "string") {
    counts.tool_results += tokensOf(content);
    return;
  }
  if (Array.isArray(content)) {
    for (const child of content) assignToolResultChild(child, counts, tokensOf);
    return;
  }
  if (content !== undefined) assignToolResultChild(content, counts, tokensOf);
}

function assignToolResultChild(
  child: unknown,
  counts: InputCounts,
  tokensOf: (text: string) => number,
): void {
  if (typeof child === "string") {
    counts.tool_results += tokensOf(child);
    return;
  }
  if (isRecord(child) && child.tl_category === "retrieval") {
    counts.retrieval += countStrings(child, tokensOf);
    return;
  }
  counts.tool_results += countStrings(child, tokensOf);
}
