export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "TokenLens API",
    version: "1.0.0",
    description: "Report model calls and receive live call updates. Web pages use the session cookie. Reporting uses a project API key.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", description: "Project reporting key. Send Authorization: Bearer <key>." },
      session: { type: "apiKey", in: "cookie", name: "tokenlens_session", description: "Signed-in browser session." },
    },
    schemas: {
      EventReport: {
        type: "object",
        required: ["id", "provider", "agent", "model", "request", "usage"],
        properties: {
          id: { type: "string" },
          provider: { type: "string", enum: ["anthropic", "openai"] },
          agent: { type: "string" },
          model: { type: "string" },
          request: { type: "object", description: "The provider request. Retrieval blocks use tl_category: retrieval." },
          usage: {
            type: "object",
            required: ["input_tokens"],
            properties: {
              input_tokens: { type: "integer", minimum: 0 },
              output_tokens: { type: "integer", minimum: 0 },
              cache_read_tokens: { type: "integer", minimum: 0 },
              cache_write_tokens: { type: "integer", minimum: 0 },
            },
          },
        },
      },
    },
  },
  paths: {
    "/api/v1/events": {
      post: {
        operationId: "reportEvent",
        summary: "Report one model call",
        security: [{ apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EventReport" },
              example: {
                id: "evt-demo-1",
                provider: "anthropic",
                agent: "support-agent",
                model: "claude-sonnet-4-5",
                request: {
                  model: "claude-sonnet-4-5",
                  system: "Be brief",
                  messages: [{ role: "user", content: "Where is my order" }],
                },
                usage: { input_tokens: 9, output_tokens: 2 },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "The call was stored. The id is the caller-supplied event id.",
            content: {
              "application/json": {
                example: {
                  id: "evt-demo-1",
                  projectId: "00000000-0000-4000-8000-000000000001",
                  estimated: false,
                  input: { system: 2, tool_definitions: 0, history: 0, tool_results: 0, retrieval: 0, user_input: 4, attachments: 0, overhead: 3 },
                  output: { text: 0, thinking: 0, tool_use: 0 },
                  cache: { cache_read_tokens: 0, cache_write_tokens: 0 },
                  usage: { input_tokens: 9, output_tokens: 2, cache_read_tokens: 0, cache_write_tokens: 0 },
                },
              },
            },
          },
          "400": { description: "The body does not match the schema, or usage counts are invalid." },
          "401": { description: "The API key is missing, unknown, or revoked." },
          "409": { description: "This event id was already stored for the project." },
          "413": { description: "The body is larger than 1 MB." },
          "429": { description: "The key sent more than 600 reports in the last minute." },
          "500": { description: "The server could not store the call." },
        },
      },
    },
    "/api/v1/stream": {
      get: {
        operationId: "streamCalls",
        summary: "Stream new calls for one project",
        description: "Server-Sent Events. Each event's data is one call summary. The stream sends retry: 1000. Reconnect with the Last-Event-ID header to continue after the last call id.",
        security: [{ session: [] }],
        parameters: [
          { name: "projectId", in: "query", required: true, schema: { type: "string", format: "uuid" }, example: "00000000-0000-4000-8000-000000000001" },
          { name: "agent", in: "query", required: false, schema: { type: "string" } },
          { name: "model", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "A text/event-stream of new calls. An example frame is id: <eventId> then data: {call}.",
            content: { "text/event-stream": { example: "id: 00000000-0000-4000-8000-000000000002\ndata: {\"id\":\"00000000-0000-4000-8000-000000000002\",\"agentName\":\"support-agent\"}\n\n" } },
          },
          "401": { description: "The browser session is missing or expired." },
          "403": { description: "The signed-in user cannot read that project." },
          "500": { description: "The server is missing its session secret." },
        },
      },
    },
  },
} as const;

export type OpenApiDocument = typeof openApiDocument;
