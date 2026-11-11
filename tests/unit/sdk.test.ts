import { describe, expect, it } from "vitest";
import { wrapModelClient, type ReportOptions } from "@/lib/sdk/report";

function options(capture: unknown[]): ReportOptions {
  return {
    baseUrl: "http://tokenlens.test",
    apiKey: "tl_test_key",
    agent: "demo-agent",
    fetchImpl: async (_url, init) => {
      capture.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 201 });
    },
  };
}

describe("reporting SDK", () => {
  it("reports an Anthropic client call without changing its result", async () => {
    const sent: unknown[] = [];
    const client = {
      messages: {
        create: async (request: { model: string; messages?: unknown[] }) => ({ model: request.model, usage: { input_tokens: 3, output_tokens: 1 } }),
      },
    };

    const wrapped = wrapModelClient(client, options(sent));
    const result = await wrapped.messages.create({ model: "claude-sonnet-4-5", messages: [] });

    expect(result.usage.input_tokens).toBe(3);
    expect(sent[0]).toMatchObject({
      provider: "anthropic",
      agent: "demo-agent",
      model: "claude-sonnet-4-5",
      usage: { input_tokens: 3, output_tokens: 1 },
    });
  });

  it("reports an OpenAI client call from prompt totals", async () => {
    const sent: unknown[] = [];
    const client = {
      chat: {
        completions: {
          create: async (request: { model: string; messages?: unknown[] }) => ({
            model: request.model,
            usage: { prompt_tokens: 4, completion_tokens: 2 },
          }),
        },
      },
    };

    const wrapped = wrapModelClient(client, options(sent));
    await wrapped.chat.completions.create({ model: "gpt-4.1-mini", messages: [] });

    expect(sent[0]).toMatchObject({
      provider: "openai",
      usage: { input_tokens: 4, output_tokens: 2 },
    });
  });

  it("returns the model response when reporting fails", async () => {
    const client = {
      messages: {
        create: async (request: { model: string }) => ({ model: request.model, usage: { input_tokens: 1, output_tokens: 1 } }),
      },
    };
    const wrapped = wrapModelClient(client, {
      baseUrl: "http://tokenlens.test",
      apiKey: "tl_test_key",
      agent: "demo-agent",
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });

    await expect(wrapped.messages.create({ model: "claude-sonnet-4-5" })).resolves.toMatchObject({ model: "claude-sonnet-4-5" });
  });
});
