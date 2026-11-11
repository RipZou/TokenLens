"use client";

import { useState, type ReactNode } from "react";
import { openApiDocument } from "@/lib/openapi/document";

const reportExample = openApiDocument.paths["/api/v1/events"].post.requestBody.content["application/json"].example;

export function ApiDocs() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Authentication</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-800">
          <li>POST /api/v1/events uses a project API key: Authorization: Bearer &lt;key&gt;.</li>
          <li>GET /api/v1/stream uses the signed-in tokenlens_session cookie. Try it out from this browser after you sign in.</li>
        </ul>
      </section>
      <Endpoint
        method="POST"
        path="/api/v1/events"
        summary={openApiDocument.paths["/api/v1/events"].post.summary}
        responses={openApiDocument.paths["/api/v1/events"].post.responses}
      >
        <EventTryOut />
      </Endpoint>
      <Endpoint
        method="GET"
        path="/api/v1/stream"
        summary={openApiDocument.paths["/api/v1/stream"].get.summary}
        responses={openApiDocument.paths["/api/v1/stream"].get.responses}
      >
        <p className="text-sm text-gray-700">{openApiDocument.paths["/api/v1/stream"].get.description}</p>
        <StreamTryOut />
      </Endpoint>
    </div>
  );
}

function Endpoint({
  method,
  path,
  summary,
  responses,
  children,
}: {
  method: string;
  path: string;
  summary: string;
  responses: Record<string, { description: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">
        <span className="mr-2 rounded bg-blue-50 px-2 py-1 font-mono text-sm text-blue-800">{method}</span>
        <span className="font-mono">{path}</span>
      </h2>
      <p className="mt-2 text-gray-800">{summary}</p>
      <h3 className="mt-4 font-semibold">Responses</h3>
      <ul className="mt-2 space-y-1 text-sm text-gray-800">
        {Object.entries(responses).map(([status, response]) => (
          <li key={status}>
            <span className="font-mono">{status}</span> {response.description}
          </li>
        ))}
      </ul>
      <h3 className="mt-4 font-semibold">Try it out</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EventTryOut() {
  const [apiKey, setApiKey] = useState("");
  const [body, setBody] = useState(JSON.stringify(reportExample, null, 2));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    setPending(true);
    setResult(null);
    const response = await fetch("/api/v1/events", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
    }).catch(() => null);
    setPending(false);
    if (!response) {
      setResult("The request could not be sent.");
      return;
    }
    const text = await response.text();
    setResult(`${response.status}\n${text}`);
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div>
        <label htmlFor="docs-api-key" className="block text-sm font-medium">
          API key
        </label>
        <input
          id="docs-api-key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono"
        />
      </div>
      <div>
        <label htmlFor="docs-event-body" className="block text-sm font-medium">
          Request body
        </label>
        <textarea
          id="docs-event-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={14}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
        />
      </div>
      <button type="submit" disabled={pending} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-60">
        {pending ? "Sending…" : "Send"}
      </button>
      {result ? (
        <pre role="status" className="overflow-x-auto rounded bg-gray-100 p-3 text-sm">
          {result}
        </pre>
      ) : null}
    </form>
  );
}

function StreamTryOut() {
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState("Not connected");

  function connect() {
    const source = new EventSource(`/api/v1/stream?projectId=${encodeURIComponent(projectId)}`);
    setStatus("Connecting. This uses your signed-in session.");
    source.onopen = () => setStatus("Connected. New calls will appear here.");
    source.onmessage = (event) => setLines((current) => [event.data, ...current].slice(0, 20));
    source.onerror = () => {
      setStatus("The stream stopped. The browser will retry. Sign in and use a project you can read.");
      source.close();
    };
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        connect();
      }}
    >
      <div>
        <label htmlFor="docs-project-id" className="block text-sm font-medium">
          Project id
        </label>
        <input
          id="docs-project-id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          required
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono"
        />
      </div>
      <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-white">
        Connect
      </button>
      <p role="status" className="text-sm text-gray-700">
        {status}
      </p>
      {lines.length > 0 ? (
        <ul className="space-y-2">
          {lines.map((line, index) => (
            <li key={`${index}-${line.slice(0, 24)}`} className="overflow-x-auto rounded bg-gray-100 p-2 font-mono text-sm">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
