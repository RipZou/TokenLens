# TokenLens reporting SDK

The SDK wraps an Anthropic or OpenAI client. After `messages.create` or `chat.completions.create` returns, it posts the request and the provider usage to `POST /api/v1/events`. A reporting failure does not change the model response.

## Setup

Use the module at `src/lib/sdk/report.ts`.

```ts
import Anthropic from "@anthropic-ai/sdk";
import { wrapModelClient } from "./src/lib/sdk/report";

const anthropic = wrapModelClient(new Anthropic(), {
  baseUrl: "https://token-lens-chi.vercel.app",
  apiKey: process.env.TOKENLENS_API_KEY ?? "",
  agent: "support-agent",
});

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 200,
  messages: [{ role: "user", content: "Where is my order?" }],
});
```

OpenAI uses the same wrapper:

```ts
import OpenAI from "openai";
import { wrapModelClient } from "./src/lib/sdk/report";

const openai = wrapModelClient(new OpenAI(), {
  baseUrl: "https://token-lens-chi.vercel.app",
  apiKey: process.env.TOKENLENS_API_KEY ?? "",
  agent: "support-agent",
});

await openai.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [{ role: "user", content: "Where is my order?" }],
});
```

Create the reporting key on the project page. The full key is shown once. Revoking it makes the next report return 401. The model client packages stay in the agent; TokenLens does not install them.
