export type Tokenizer = (text: string) => number;

export interface AnthropicContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  tl_category?: string;
  content?: string | AnthropicContentBlock[];
  input?: unknown;
  source?: {
    type?: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export type AnthropicMessageContent = string | AnthropicContentBlock[];

export interface AnthropicMessage {
  role?: string;
  content?: AnthropicMessageContent;
}

export interface AnthropicTool {
  name?: string;
  description?: string;
  input_schema?: unknown;
  parameters?: unknown;
}

export interface AnthropicMessagesRequest {
  model?: string;
  system?: string | AnthropicContentBlock[];
  messages?: AnthropicMessage[];
  tools?: AnthropicTool[];
}

export interface AnthropicUsage {
  input_tokens: number;
}

export interface InputTokenBreakdown {
  system: number;
  tool_definitions: number;
  history: number;
  tool_results: number;
  retrieval: number;
  user_input: number;
  attachments: number;
  overhead: number;
  estimated: boolean;
}

type Category =
  | "system"
  | "tool_definitions"
  | "history"
  | "tool_results"
  | "retrieval"
  | "user_input"
  | "attachments";

type Counts = Record<Category, number>;

const CATEGORIES: readonly Category[] = [
  "system",
  "tool_definitions",
  "history",
  "tool_results",
  "retrieval",
  "user_input",
  "attachments",
];

/** Billed tokens within this distance of the local count stay put; the gap is overhead. */
const OVERHEAD_TOLERANCE = 5;

function wordCount(text: string): number {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function resolveTokenizer(
  providerOrTokenizer?: string | Tokenizer,
  tokenize?: Tokenizer,
): Tokenizer {
  if (typeof tokenize === "function") return tokenize;
  if (typeof providerOrTokenizer === "function") return providerOrTokenizer;
  return wordCount;
}

function emptyCounts(): Counts {
  return {
    system: 0,
    tool_definitions: 0,
    history: 0,
    tool_results: 0,
    retrieval: 0,
    user_input: 0,
    attachments: 0,
  };
}

function textOf(value: unknown, tokenize: Tokenizer): number {
  return typeof value === "string" ? tokenize(value) : 0;
}

function jsonStringTokens(value: unknown, tokenize: Tokenizer): number {
  if (typeof value === "string") return tokenize(value);
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + jsonStringTokens(item, tokenize), 0);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce(
      (sum, item) => sum + jsonStringTokens(item, tokenize),
      0,
    );
  }
  return 0;
}

function schemaTokens(schema: unknown, tokenize: Tokenizer): number {
  if (!schema || typeof schema !== "object") return 0;
  if (Array.isArray(schema)) {
    return schema.reduce((sum, item) => {
      if (typeof item === "string") return sum + tokenize(item);
      return sum + schemaTokens(item, tokenize);
    }, 0);
  }

  const record = schema as Record<string, unknown>;
  let total = textOf(record.description, tokenize) + textOf(record.title, tokenize);
  if (typeof record.const === "string") total += tokenize(record.const);
  total += jsonStringTokens(record.enum, tokenize);

  const properties = record.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [name, property] of Object.entries(properties as Record<string, unknown>)) {
      total += tokenize(name);
      total += schemaTokens(property, tokenize);
    }
  }

  total += schemaTokens(record.items, tokenize);
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    if (Array.isArray(record[key])) total += schemaTokens(record[key], tokenize);
  }
  return total;
}

function toolTokens(tools: unknown, tokenize: Tokenizer): number {
  if (!Array.isArray(tools)) return 0;
  let total = 0;
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const record = tool as AnthropicTool;
    total += textOf(record.name, tokenize);
    total += textOf(record.description, tokenize);
    total += schemaTokens(record.input_schema ?? record.parameters, tokenize);
  }
  return total;
}

function systemTokens(system: AnthropicMessagesRequest["system"], tokenize: Tokenizer): number {
  if (typeof system === "string") return tokenize(system);
  if (!Array.isArray(system)) return 0;
  return system.reduce((sum, block) => sum + textOf(block?.text, tokenize), 0);
}

function attachmentTokens(block: AnthropicContentBlock, tokenize: Tokenizer): number {
  const source = block.source;
  if (!source) return 0;
  return (
    textOf(source.media_type, tokenize) +
    textOf(source.data, tokenize) +
    textOf(source.url, tokenize)
  );
}

function toolResultTokens(content: unknown, tokenize: Tokenizer): number {
  if (typeof content === "string") return tokenize(content);
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const block of content) {
    if (typeof block === "string") {
      total += tokenize(block);
      continue;
    }
    if (!block || typeof block !== "object") continue;
    if (block.type === "image" || block.type === "document") {
      total += attachmentTokens(block, tokenize);
      continue;
    }
    total += textOf(block.text, tokenize);
  }
  return total;
}

function consumeBlock(
  block: unknown,
  plain: "history" | "user_input",
  counts: Counts,
  tokenize: Tokenizer,
): void {
  if (typeof block === "string") {
    counts[plain] += tokenize(block);
    return;
  }
  if (!block || typeof block !== "object") return;
  const record = block as AnthropicContentBlock;
  if (record.tl_category === "retrieval") {
    counts.retrieval += textOf(record.text, tokenize);
    return;
  }
  if (record.type === "tool_result") {
    counts.tool_results += toolResultTokens(record.content, tokenize);
    return;
  }
  if (record.type === "image" || record.type === "document") {
    counts.attachments += attachmentTokens(record, tokenize);
    return;
  }
  if (record.type === "tool_use") {
    counts[plain] += textOf(record.name, tokenize);
    counts[plain] += jsonStringTokens(record.input, tokenize);
    return;
  }
  if (typeof record.text === "string") {
    counts[plain] += tokenize(record.text);
    return;
  }
  if (typeof record.thinking === "string") counts[plain] += tokenize(record.thinking);
}

function consumeContent(
  content: unknown,
  plain: "history" | "user_input",
  counts: Counts,
  tokenize: Tokenizer,
): void {
  if (typeof content === "string") {
    counts[plain] += tokenize(content);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const block of content) consumeBlock(block, plain, counts, tokenize);
}

function attributeMessages(
  messages: AnthropicMessage[] | undefined,
  counts: Counts,
  tokenize: Tokenizer,
): void {
  if (!Array.isArray(messages)) return;
  let currentUser = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      currentUser = index;
      break;
    }
  }
  messages.forEach((message, index) => {
    const plain = index === currentUser ? "user_input" : "history";
    consumeContent(message?.content, plain, counts, tokenize);
  });
}

function scaleToTotal(counts: Counts, target: number): Counts {
  const scaled = emptyCounts();
  const rawTotal = CATEGORIES.reduce((sum, key) => sum + counts[key], 0);
  if (rawTotal === 0 || target <= 0) return scaled;

  const floors = CATEGORIES.map((key) => Math.floor((counts[key] * target) / rawTotal));
  let leftover = target - floors.reduce((sum, value) => sum + value, 0);
  const ranked = CATEGORIES.map((key, index) => ({
    index,
    remainder: (counts[key] * target) % rawTotal,
  })).sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (const entry of ranked) {
    if (leftover <= 0) break;
    floors[entry.index] += 1;
    leftover -= 1;
  }

  CATEGORIES.forEach((key, index) => {
    scaled[key] = floors[index];
  });
  return scaled;
}

export function classify(
  request: AnthropicMessagesRequest,
  usage: AnthropicUsage,
  providerOrTokenizer?: string | Tokenizer,
  tokenize?: Tokenizer,
): InputTokenBreakdown {
  if (!Number.isInteger(usage?.input_tokens)) {
    throw new Error("usage.input_tokens must be an integer");
  }

  const count = resolveTokenizer(providerOrTokenizer, tokenize);
  const raw = emptyCounts();
  raw.system = systemTokens(request?.system, count);
  raw.tool_definitions = toolTokens(request?.tools, count);
  attributeMessages(request?.messages, raw, count);

  const rawTotal = CATEGORIES.reduce((sum, key) => sum + raw[key], 0);
  const gap = usage.input_tokens - rawTotal;
  if (Math.abs(gap) <= OVERHEAD_TOLERANCE) {
    return { ...raw, overhead: gap, estimated: false };
  }
  if (rawTotal === 0) {
    return { ...emptyCounts(), overhead: usage.input_tokens, estimated: true };
  }
  return { ...scaleToTotal(raw, usage.input_tokens), overhead: 0, estimated: true };
}
