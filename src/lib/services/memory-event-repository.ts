import { randomUUID } from "node:crypto";
import {
  DuplicateEventError,
  type EventRepository,
  type NewEvent,
  type StoredEvent,
} from "@/lib/services/event-repository";

export class MemoryEventRepository implements EventRepository {
  private readonly events: StoredEvent[] = [];

  async create(input: NewEvent): Promise<StoredEvent> {
    const duplicate = this.events.some(
      (event) => event.projectId === input.projectId && event.externalId === input.externalId,
    );
    if (duplicate) throw new DuplicateEventError();
    const stored = { id: randomUUID(), ...input, breakdowns: input.breakdowns.map((row) => ({ ...row })) };
    this.events.push(stored);
    return clone(stored);
  }

  async listInRange(projectIds: string[], since: Date): Promise<StoredEvent[]> {
    const allowed = new Set(projectIds);
    return this.events
      .filter((event) => allowed.has(event.projectId) && event.createdAt.getTime() >= since.getTime())
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
      .map(clone);
  }

  async findInProjects(id: string, projectIds: string[]): Promise<StoredEvent | null> {
    const allowed = new Set(projectIds);
    const found = this.events.find((event) => event.id === id && allowed.has(event.projectId));
    return found ? clone(found) : null;
  }

  saved(): StoredEvent[] {
    return this.events.map(clone);
  }
}

function clone(event: StoredEvent): StoredEvent {
  return { ...event, breakdowns: event.breakdowns.map((row) => ({ ...row })) };
}
