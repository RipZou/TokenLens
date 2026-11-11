import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INPUT_CATEGORIES, classify, type InputCategory } from "@/lib/classifier/classify";
import { ingestEventSchema } from "@/lib/schemas/events";

const FIXTURE_DIR = join(process.cwd(), "fixtures", "openai");

type Fixture = {
  name: string;
  provider: string;
  request: unknown;
  usage: { input_tokens: number };
  expected: Record<InputCategory, number> & { estimated: boolean };
};

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((fileName) => {
      const parsed: unknown = JSON.parse(readFileSync(join(FIXTURE_DIR, fileName), "utf8"));
      if (!isRecord(parsed) || !isRecord(parsed.usage) || !isRecord(parsed.expected) || typeof parsed.provider !== "string") {
        throw new Error(`Invalid fixture: ${fileName}`);
      }
      const inputTokens = parsed.usage.input_tokens;
      if (typeof inputTokens !== "number") throw new Error(`Invalid fixture: ${fileName}`);
      return {
        name: fileName.replace(/\.json$/, ""),
        provider: parsed.provider,
        request: parsed.request,
        usage: { input_tokens: inputTokens },
        expected: parsed.expected as Fixture["expected"],
      };
    });
}

const fixtures = loadFixtures();

describe("openai fixtures", () => {
  it("covers the chat request shapes", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
  });

  it.each(fixtures)("$name matches the expected assignment", (fixture) => {
    const result = classify(fixture.request, fixture.usage, fixture.provider, wordCount);
    expect(result.input).toEqual({
      system: fixture.expected.system,
      tool_definitions: fixture.expected.tool_definitions,
      history: fixture.expected.history,
      tool_results: fixture.expected.tool_results,
      retrieval: fixture.expected.retrieval,
      user_input: fixture.expected.user_input,
      attachments: fixture.expected.attachments,
      overhead: fixture.expected.overhead,
    });
    expect(result.estimated).toBe(fixture.expected.estimated);
    const sum = INPUT_CATEGORIES.reduce((total, category) => total + result.input[category], 0);
    expect(sum).toBe(fixture.usage.input_tokens);
  });

  it("reads OpenAI prompt and completion totals", () => {
    const result = classify(
      { messages: [{ role: "user", content: "Hello" }] },
      { prompt_tokens: 1, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 0 } },
      "openai",
      wordCount,
    );
    expect(result.usage).toEqual({
      input_tokens: 1,
      output_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    });
  });

  it("accepts an OpenAI report at the ingest boundary", () => {
    const parsed = ingestEventSchema.safeParse({
      id: "evt-openai-1",
      provider: "openai",
      agent: "support-agent",
      model: "gpt-4.1-mini",
      request: { messages: [{ role: "user", content: "Hello" }] },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(parsed.success).toBe(true);
  });
});
