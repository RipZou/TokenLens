import { forbidden } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { subscribeProject } from "@/lib/services/call-bus";
import { readableProjects, summarizeCall, type CallDependencies, type CallListItem } from "@/lib/services/calls";
import type { StoredEvent } from "@/lib/services/event-repository";

export { applyLiveCall, connectionLabel } from "@/lib/dashboard/live";

export const STREAM_POLL_MS = 1000;
const RETRY_MS = 1000;

export type StreamDependencies = CallDependencies & {
  secret: string;
  pollMs?: number;
};

type Cursor = { createdAt: number; id: string };

function isNewer(event: StoredEvent, cursor: Cursor | null, connectedAt: number): boolean {
  if (cursor === null) return event.createdAt.getTime() > connectedAt;
  const delta = event.createdAt.getTime() - cursor.createdAt;
  return delta > 0 || (delta === 0 && event.id > cursor.id);
}

function encodeCall(event: StoredEvent): string {
  const call: CallListItem = summarizeCall(event);
  return `id: ${event.id}\ndata: ${JSON.stringify(call)}\n\n`;
}

export async function handleProjectStream(request: Request, deps: StreamDependencies): Promise<Response> {
  const session = await requireUser(request, deps.secret);
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const projects = await readableProjects(session.sub, deps);
  if (!projectId || !projects.some((project) => project.id === projectId)) return forbidden();

  const agent = url.searchParams.get("agent")?.trim() || null;
  const model = url.searchParams.get("model")?.trim() || null;
  const pollMs = deps.pollMs ?? STREAM_POLL_MS;
  const encoder = new TextEncoder();
  let cursor: Cursor | null = null;
  const lastId = request.headers.get("last-event-id");
  if (lastId) {
    const existing = await deps.events.findInProjects(lastId, [projectId]);
    if (existing) cursor = { createdAt: existing.createdAt.getTime(), id: existing.id };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const connectedAt = Date.now();
      const sent = new Set<string>();
      if (cursor) sent.add(cursor.id);
      let closed = false;
      const timer = setInterval(() => void tick(), pollMs);
      const unsubscribe = subscribeProject(projectId, (event) => send(event));

      function close() {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // The client already stopped reading.
        }
      }

      function send(event: StoredEvent) {
        if (closed || sent.has(event.id) || event.projectId !== projectId) return;
        if (agent && event.agentName !== agent) return;
        if (model && event.model !== model) return;
        if (!isNewer(event, cursor, connectedAt)) return;
        sent.add(event.id);
        cursor = { createdAt: event.createdAt.getTime(), id: event.id };
        controller.enqueue(encoder.encode(encodeCall(event)));
      }

      async function tick() {
        if (closed) return;
        const since = new Date(cursor ? cursor.createdAt : connectedAt);
        const found = await deps.events.listInRange([projectId], since);
        for (const event of [...found].reverse()) send(event);
      }

      controller.enqueue(encoder.encode(`retry: ${RETRY_MS}\n\n`));
      request.signal.addEventListener("abort", close);
      if (request.signal.aborted) close();
      await tick();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
