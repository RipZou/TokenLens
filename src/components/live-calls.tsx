"use client";

import { useEffect, useState } from "react";
import { CallList } from "@/components/call-list";
import { applyLiveCall, connectionLabel } from "@/lib/dashboard/live";
import type { CallListItem } from "@/lib/services/calls";

export function LiveCalls({
  calls,
  projectIds,
  agent,
  model,
}: {
  calls: CallListItem[];
  projectIds: string[];
  agent: string | null;
  model: string | null;
}) {
  const [rows, setRows] = useState(calls);
  const [state, setState] = useState<"connecting" | "open" | "error">(projectIds.length === 0 ? "open" : "connecting");
  const projects = projectIds.join("\n");

  useEffect(() => {
    if (projects.length === 0) return;
    const sources = projects.split("\n").map((projectId) => {
      const params = new URLSearchParams({ projectId });
      if (agent) params.set("agent", agent);
      if (model) params.set("model", model);
      const source = new EventSource(`/api/v1/stream?${params.toString()}`);
      source.onopen = () => setState("open");
      source.onerror = () => setState("error");
      source.onmessage = (message) => {
        const incoming = JSON.parse(message.data) as CallListItem;
        setRows((current) => applyLiveCall(current, incoming));
      };
      return source;
    });
    return () => {
      for (const source of sources) source.close();
    };
  }, [projects, agent, model]);

  return (
    <>
      {projectIds.length > 0 ? (
        <p role="status" className="mt-2 text-sm text-gray-700">
          <span
            className={`mr-2 inline-block h-2 w-2 rounded-full ${state === "open" ? "bg-green-600" : "bg-amber-500"}`}
            aria-hidden="true"
          />
          {connectionLabel(state)}
        </p>
      ) : null}
      <CallList calls={rows} />
    </>
  );
}
