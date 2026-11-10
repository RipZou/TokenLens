import type { StoredEvent } from "@/lib/services/event-repository";

type Listener = (event: StoredEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function publishStoredEvent(event: StoredEvent): void {
  for (const listener of listeners.get(event.projectId) ?? []) listener(event);
}

export function subscribeProject(projectId: string, listener: Listener): () => void {
  const group = listeners.get(projectId) ?? new Set<Listener>();
  group.add(listener);
  listeners.set(projectId, group);
  return () => {
    group.delete(listener);
    if (group.size === 0) listeners.delete(projectId);
  };
}
