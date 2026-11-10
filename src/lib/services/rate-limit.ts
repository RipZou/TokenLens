export const INGEST_RATE_LIMIT = 600;
export const INGEST_WINDOW_MS = 60_000;
export const MAX_INGEST_BODY_BYTES = 1024 * 1024;

export interface RateLimiter {
  allow(keyId: string, now: number): boolean;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit = INGEST_RATE_LIMIT,
    private readonly windowMs = INGEST_WINDOW_MS,
  ) {}

  allow(keyId: string, now: number): boolean {
    const recent = (this.hits.get(keyId) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(keyId, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(keyId, recent);
    return true;
  }
}
