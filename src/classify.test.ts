import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, type AnthropicMessagesRequest, type AnthropicUsage, type InputTokenBreakdown, type Tokenizer } from "./classify.ts";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "anthropic");

interface Fixture {
  name: string;
  request: AnthropicMessagesRequest;
  usage: AnthropicUsage;
  expected: InputTokenBreakdown;
}

function wordCount(text: string): number {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function loadFixtures(): Fixture[] {
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as Omit<Fixture, "name">;
      return { name: name.replace(/\.json$/, ""), ...fixture };
    });
}

describe("classify", () => {
  for (const fixture of loadFixtures()) {
    it(`attributes ${fixture.name}`, () => {
      const output = classify(fixture.request, fixture.usage, "anthropic", wordCount);
      assert.deepEqual(
        {
          system: output.system,
          tool_definitions: output.tool_definitions,
          history: output.history,
          tool_results: output.tool_results,
          retrieval: output.retrieval,
          user_input: output.user_input,
          attachments: output.attachments,
          overhead: output.overhead,
          estimated: output.estimated,
        },
        fixture.expected,
      );
    });
  }

  it("defaults to a word tokenizer when none is passed", () => {
    const fixture = loadFixtures().find((item) => item.name === "system-and-user");
    assert.ok(fixture);
    assert.deepEqual(classify(fixture.request, fixture.usage), classify(fixture.request, fixture.usage, "anthropic", wordCount));
  });

  it("uses a caller-supplied tokenizer", () => {
    const request: AnthropicMessagesRequest = {
      system: "ab cd",
      messages: [{ role: "user", content: "ef" }],
    };
    const tokenize: Tokenizer = (text) => text.length;
    const output = classify(request, { input_tokens: 3 }, "anthropic", tokenize);
    assert.equal(output.system, 5);
    assert.equal(output.user_input, 2);
    assert.equal(output.overhead, -4);
    assert.equal(output.estimated, false);
  });

  it("scales uneven counts so the sum matches billed input tokens", () => {
    const request: AnthropicMessagesRequest = {
      system: "one",
      messages: [{ role: "user", content: "two two" }],
    };
    const output = classify(request, { input_tokens: 10 });
    assert.equal(output.system, 3);
    assert.equal(output.user_input, 7);
    assert.equal(output.overhead, 0);
    assert.equal(output.estimated, true);
    assert.equal(output.system + output.user_input, 10);
  });
});
