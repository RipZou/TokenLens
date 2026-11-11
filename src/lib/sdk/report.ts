export type ReportOptions = {
  baseUrl: string;
  apiKey: string;
  agent: string;
  fetchImpl?: typeof fetch;
};

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

export async function reportModelCall(
  options: ReportOptions,
  input: { id?: string; provider: "anthropic" | "openai"; model: string; request: unknown; usage: Usage },
): Promise<Response> {
  const send = options.fetchImpl ?? fetch;
  return send(new URL("/api/v1/events", options.baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      id: input.id ?? crypto.randomUUID(),
      provider: input.provider,
      agent: options.agent,
      model: input.model,
      request: input.request,
      usage: {
        input_tokens: input.usage.input_tokens ?? input.usage.prompt_tokens ?? 0,
        output_tokens: input.usage.output_tokens ?? input.usage.completion_tokens ?? 0,
        cache_read_tokens: input.usage.cache_read_tokens ?? input.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: input.usage.cache_write_tokens ?? input.usage.cache_creation_input_tokens ?? 0,
      },
    }),
  });
}

export function wrapModelClient<T extends object>(client: T, options: ReportOptions): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if ((prop === "messages" || prop === "chat" || prop === "completions") && value && typeof value === "object") {
        return wrapModelClient(value, options);
      }
      if (prop === "create" && typeof value === "function") {
        return async (...args: unknown[]) => {
          const result = await (value as (...input: unknown[]) => Promise<unknown>).apply(target, args);
          try {
            await reportFromResult(options, args[0], result);
          } catch {
            // A reporting failure leaves the model response intact.
          }
          return result;
        };
      }
      return typeof value === "function" ? (value as (...input: unknown[]) => unknown).bind(target) : value;
    },
  }) as T;
}

async function reportFromResult(options: ReportOptions, request: unknown, result: unknown): Promise<void> {
  if (!isRecord(result) || !isRecord(result.usage) || !isRecord(request)) return;
  const usage = result.usage as Usage;
  const provider = typeof usage.input_tokens === "number" ? "anthropic" : "openai";
  const model = typeof result.model === "string" ? result.model : typeof request.model === "string" ? request.model : "";
  if (!model) return;
  await reportModelCall(options, { provider, model, request, usage });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
