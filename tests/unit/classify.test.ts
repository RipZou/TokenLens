import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INPUT_CATEGORIES, classify, type Breakdown, type InputCategory } from "@/lib/classifier/classify";

const FIXTURE_DIR = join(process.cwd(), "fixtures", "anthropic");

type Fixture = {
  name: string;
  provider: string;
  request: unknown;
  usage: { input_tokens: number };
  expected: Record<InputCategory, number> & { estimated: boolean };
};

function wordCount(text: string): number {
  if (typeof text !== "string") return 0;
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
      if (!isRecord(parsed) || !isRecord(parsed.usage) || !isRecord(parsed.expected)) {
        throw new Error(`Invalid fixture: ${fileName}`);
      }
      const provider = parsed.provider;
      const inputTokens = parsed.usage.input_tokens;
      if (typeof provider !== "string" || typeof inputTokens !== "number") {
        throw new Error(`Invalid fixture: ${fileName}`);
      }
      return {
        name: fileName.replace(/\.json$/, ""),
        provider,
        request: parsed.request,
        usage: { input_tokens: inputTokens },
        expected: parsed.expected as Fixture["expected"],
      };
    });
}

const fixtures = loadFixtures();

function expectSum(result: Breakdown, inputTokens: number): void {
  const sum = INPUT_CATEGORIES.reduce((total, category) => total + result.input[category], 0);
  expect(sum).toBe(inputTokens);
  for (const category of INPUT_CATEGORIES) {
    expect(Number.isInteger(result.input[category])).toBe(true);
    expect(result.input[category]).toBeGreaterThanOrEqual(0);
  }
}

function classifyAnthropic(
  request: unknown,
  inputTokens: number,
  countTokens: (text: string) => number = wordCount,
  usage: Record<string, unknown> = {},
): Breakdown {
  const result = classify(request, { input_tokens: inputTokens, ...usage }, "anthropic", countTokens);
  expectSum(result, inputTokens);
  return result;
}

describe("anthropic fixtures", () => {
  it("covers at least eight requests", () => {
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
    expectSum(result, fixture.usage.input_tokens);
  });

  it("calibrated categories sum to input_tokens for every fixture", () => {
    for (const fixture of fixtures) {
      const result = classify(fixture.request, fixture.usage, fixture.provider, wordCount);
      expectSum(result, fixture.usage.input_tokens);
    }
  });

  it("keeps raw local counts separate from calibrated counts", () => {
    const withinFive = fixtures.find((fixture) => fixture.name === "overhead-within-five");
    const scaled = fixtures.find((fixture) => fixture.name === "estimated-scale");
    if (!withinFive || !scaled) throw new Error("missing calibration fixtures");

    const within = classify(withinFive.request, withinFive.usage, withinFive.provider, wordCount);
    expect(within.raw).toEqual({
      system: 18,
      tool_definitions: 0,
      history: 0,
      tool_results: 0,
      retrieval: 0,
      user_input: 5,
      attachments: 0,
      overhead: 0,
    });
    expect(within.input.overhead).toBe(1);
    expect(within.estimated).toBe(false);

    const estimate = classify(scaled.request, scaled.usage, scaled.provider, wordCount);
    expect(estimate.raw.system).toBe(2);
    expect(estimate.raw.user_input).toBe(2);
    expect(estimate.raw.overhead).toBe(0);
    expect(estimate.input.system).toBe(5);
    expect(estimate.input.user_input).toBe(5);
    expect(estimate.estimated).toBe(true);
  });

  it("does not mutate the request or usage", () => {
    for (const fixture of fixtures) {
      const request = structuredClone(fixture.request);
      const usage = structuredClone(fixture.usage);
      const before = JSON.stringify({ request, usage });
      classify(request, usage, fixture.provider, wordCount);
      expect(JSON.stringify({ request, usage })).toBe(before);
    }
  });

  it("counts system and user segments separately", () => {
    const seen: string[] = [];
    const fixture = fixtures.find((item) => item.name === "system-and-user");
    if (!fixture) throw new Error("missing system-and-user fixture");
    classify(fixture.request, fixture.usage, fixture.provider, (text) => {
      seen.push(text);
      return wordCount(text);
    });
    expect(seen).toContain("You are a support agent");
    expect(seen).toContain("Where is my order");
  });
});

describe("assignment priority", () => {
  it("counts a block-shaped system prompt as system", () => {
    const result = classifyAnthropic(
      {
        system: [{ type: "text", text: "Be brief" }],
        messages: [{ role: "user", content: "Hello" }],
      },
      3,
    );
    expect(result.input.system).toBe(2);
    expect(result.input.user_input).toBe(1);
  });

  it("counts system and developer messages as system", () => {
    const result = classifyAnthropic(
      {
        messages: [
          { role: "system", content: "Be brief" },
          { role: "developer", content: "Use tools" },
          { role: "assistant", content: "Noted" },
          { role: "user", content: "Hello" },
        ],
      },
      6,
    );
    expect(result.input).toMatchObject({ system: 4, history: 1, user_input: 1 });
  });

  it("keeps retrieval out of history when the marker is on the message", () => {
    const result = classifyAnthropic(
      {
        messages: [
          { role: "user", content: "Old policy notes", tl_category: "retrieval" },
          { role: "assistant", content: "Noted" },
          { role: "user", content: "Use that policy" },
        ],
      },
      7,
    );
    expect(result.input).toMatchObject({ retrieval: 3, history: 1, user_input: 3 });
  });

  it("prefers retrieval over an attachment in the same block", () => {
    const result = classifyAnthropic(
      {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                tl_category: "retrieval",
                source: { type: "base64", media_type: "image/png", data: "slip photo" },
              },
              { type: "text", text: "Hello there" },
            ],
          },
        ],
      },
      5,
    );
    expect(result.input.retrieval).toBe(3);
    expect(result.input.attachments).toBe(0);
    expect(result.input.user_input).toBe(2);
  });

  it("counts an earlier image as attachments rather than history", () => {
    const result = classifyAnthropic(
      {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: "slip photo" },
              },
              { type: "text", text: "Old receipt" },
            ],
          },
          { role: "user", content: "What is this" },
        ],
      },
      8,
    );
    expect(result.input).toMatchObject({ attachments: 3, history: 2, user_input: 3 });
  });

  it("counts a document block as attachments", () => {
    const result = classifyAnthropic(
      {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: "invoice scan" },
              },
              { type: "text", text: "See file" },
            ],
          },
        ],
      },
      5,
    );
    expect(result.input).toMatchObject({ attachments: 3, user_input: 2 });
  });

  it("counts an earlier tool result as tool_results rather than history", () => {
    const result = classifyAnthropic(
      {
        messages: [
          { role: "user", content: "Check the order" },
          {
            role: "assistant",
            content: [
              { type: "tool_use", id: "t1", name: "get_order", input: { order_id: "A 100" } },
            ],
          },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: "t1", content: "Shipped on Monday" }],
          },
          { role: "user", content: "Thanks" },
        ],
      },
      10,
    );
    expect(result.input).toMatchObject({ history: 6, tool_results: 3, user_input: 1 });
  });

  it("pulls retrieval out of a tool result without moving the sibling text", () => {
    const result = classifyAnthropic(
      {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t1",
                content: [
                  { type: "text", text: "Old policy notes", tl_category: "retrieval" },
                  { type: "text", text: "Shipped on Monday" },
                ],
              },
              { type: "text", text: "Thanks" },
            ],
          },
        ],
      },
      7,
    );
    expect(result.input).toMatchObject({ retrieval: 3, tool_results: 3, user_input: 1, history: 0 });
  });
});

describe("calibration", () => {
  function scripted(map: Record<string, number>): (text: string) => number {
    return (text) => {
      if (!(text in map)) throw new Error(`unexpected segment: ${text}`);
      return map[text] ?? 0;
    };
  }

  it("adds the gap to overhead when the local sum is under the target by exactly 5%", () => {
    const result = classifyAnthropic({ system: "S", messages: [{ role: "user", content: "U" }] }, 100, scripted({ S: 95, U: 0 }));
    expect(result.estimated).toBe(false);
    expect(result.input.system).toBe(95);
    expect(result.input.overhead).toBe(5);
    expect(result.raw.overhead).toBe(0);
  });

  it("scales and marks estimated when the local sum is under the target by more than 5%", () => {
    const result = classifyAnthropic({ system: "S", messages: [{ role: "user", content: "U" }] }, 100, scripted({ S: 94, U: 0 }));
    expect(result.estimated).toBe(true);
    expect(result.input).toMatchObject({ system: 100, overhead: 0, user_input: 0 });
  });

  it("scales without estimated when the local sum is over the target by exactly 5%", () => {
    const result = classifyAnthropic({ system: "S", messages: [{ role: "user", content: "U" }] }, 100, scripted({ S: 105, U: 0 }));
    expect(result.estimated).toBe(false);
    expect(result.input.system).toBe(100);
    expect(result.input.overhead).toBe(0);
  });

  it("scales and marks estimated when the local sum is over the target by more than 5%", () => {
    const result = classifyAnthropic({ system: "S", messages: [{ role: "user", content: "U" }] }, 100, scripted({ S: 106, U: 0 }));
    expect(result.estimated).toBe(true);
    expect(result.input.system).toBe(100);
    expect(result.input.overhead).toBe(0);
  });

  it("scales a within-5% overage with largest-remainder rounding", () => {
    const result = classifyAnthropic({ system: "S", messages: [{ role: "user", content: "U" }] }, 96, scripted({ S: 60, U: 40 }));
    expect(result.estimated).toBe(false);
    expect(result.input.system).toBe(58);
    expect(result.input.user_input).toBe(38);
    expect(result.input.overhead).toBe(0);
  });

  it("gives largest-remainder ties to the earlier category", () => {
    const result = classifyAnthropic(
      {
        tools: [{ name: "TOOL" }],
        messages: [
          { role: "user", content: "HIST" },
          { role: "user", content: "USER" },
        ],
      },
      3,
      scripted({ TOOL: 1, HIST: 1, USER: 0 }),
    );
    expect(result.estimated).toBe(true);
    expect(result.input.tool_definitions).toBe(2);
    expect(result.input.history).toBe(1);
    expect(result.input.user_input).toBe(0);
  });

  it("gives the next token to the larger remainder", () => {
    const result = classifyAnthropic({ system: "S", messages: [{ role: "user", content: "U" }] }, 10, scripted({ S: 2, U: 1 }));
    expect(result.estimated).toBe(true);
    expect(result.input.system).toBe(7);
    expect(result.input.user_input).toBe(3);
  });

  it("returns zeros without estimated when both the target and the local sum are zero", () => {
    const result = classifyAnthropic({}, 0);
    expect(result.estimated).toBe(false);
    expect(result.input).toEqual({
      system: 0,
      tool_definitions: 0,
      history: 0,
      tool_results: 0,
      retrieval: 0,
      user_input: 0,
      attachments: 0,
      overhead: 0,
    });
  });

  it("returns zeros and marks estimated when the target is zero but local counts were positive", () => {
    const result = classifyAnthropic({ system: "Hello there" }, 0);
    expect(result.estimated).toBe(true);
    expect(result.raw.system).toBe(2);
    for (const category of INPUT_CATEGORIES) expect(result.input[category]).toBe(0);
  });

  it("puts the whole target in overhead and marks estimated when nothing local was counted", () => {
    const result = classifyAnthropic({}, 8);
    expect(result.estimated).toBe(true);
    expect(result.input.overhead).toBe(8);
    expect(result.raw.overhead).toBe(0);
  });
});

describe("usage boundaries", () => {
  it("keeps output tokens and cache metadata out of the input categories", () => {
    const fixture = fixtures.find((item) => item.name === "system-and-user");
    if (!fixture) throw new Error("missing system-and-user fixture");
    const result = classify(
      fixture.request,
      {
        input_tokens: 9,
        output_tokens: 20,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 4,
      },
      "anthropic",
      wordCount,
    );
    expectSum(result, 9);
    expect(result.output).toEqual({ text: 0, thinking: 0, tool_use: 0 });
    expect(result.cache).toEqual({ cache_read_tokens: 3, cache_write_tokens: 4 });
    expect(result.usage).toEqual({
      input_tokens: 9,
      output_tokens: 20,
      cache_read_tokens: 3,
      cache_write_tokens: 4,
    });
  });

  it.each([
    ["negative input_tokens", { input_tokens: -1 }],
    ["fractional input_tokens", { input_tokens: 1.5 }],
    ["NaN input_tokens", { input_tokens: Number.NaN }],
    ["string input_tokens", { input_tokens: "9" }],
    ["missing input_tokens", {}],
    ["null usage", null],
  ])("rejects %s", (_label, usage) => {
    expect(() => classify({ messages: [] }, usage, "anthropic", wordCount)).toThrow(/Invalid usage/);
  });

  it("rejects negative output and cache counts", () => {
    expect(() => classify({}, { input_tokens: 1, output_tokens: -1 }, "anthropic", wordCount)).toThrow(/output_tokens/);
    expect(() =>
      classify({}, { input_tokens: 1, cache_read_input_tokens: -1 }, "anthropic", wordCount),
    ).toThrow(/cache_read_input_tokens/);
    expect(() =>
      classify({}, { input_tokens: 1, cache_creation_input_tokens: -2 }, "anthropic", wordCount),
    ).toThrow(/cache_creation_input_tokens/);
  });

  it("rejects an unsupported provider", () => {
    expect(() => classify({}, { input_tokens: 0 }, "openai", wordCount)).toThrow(/Unsupported provider/);
  });

  it("rejects a missing token counter", () => {
    expect(() => classify({}, { input_tokens: 0 }, "anthropic", undefined as never)).toThrow(/countTokens/);
  });

  it("rejects a non-integer token count", () => {
    expect(() => classify({ system: "Hello" }, { input_tokens: 1 }, "anthropic", () => 1.5)).toThrow(/Invalid token count/);
  });

  it("rejects a request that is not an object", () => {
    expect(() => classify(null, { input_tokens: 0 }, "anthropic", wordCount)).toThrow(/Invalid request/);
    expect(() => classify([], { input_tokens: 0 }, "anthropic", wordCount)).toThrow(/Invalid request/);
  });

  it("rejects tools or messages of the wrong type", () => {
    expect(() => classify({ tools: "get_order" }, { input_tokens: 0 }, "anthropic", wordCount)).toThrow(/tools/);
    expect(() => classify({ messages: { role: "user" } }, { input_tokens: 0 }, "anthropic", wordCount)).toThrow(/messages/);
  });
});
