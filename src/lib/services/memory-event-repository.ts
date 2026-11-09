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
    return stored;
  }

  saved(): StoredEvent[] {
    return this.events.map((event) => ({ ...event, breakdowns: event.breakdowns.map((row) => ({ ...row })) }));
  }
}
