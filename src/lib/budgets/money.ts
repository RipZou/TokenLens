const SCALE = 8;
const MICROS = 10n ** BigInt(SCALE);
const PER_MILLION = 1_000_000n;

export function parseUsd(value: string): bigint | null {
  if (!/^\d+(\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const digits = `${whole}${fraction.padEnd(SCALE, "0")}`;
  return BigInt(digits);
}

export function formatUsd(micros: bigint): string {
  const negative = micros < 0n;
  const absolute = negative ? -micros : micros;
  const whole = absolute / MICROS;
  const fraction = (absolute % MICROS).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export type TokenPrice = {
  inputPerMtok: bigint;
  outputPerMtok: bigint;
  cacheReadPerMtok: bigint;
  cacheWritePerMtok: bigint;
};

export function costMicros(
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number },
  price: TokenPrice,
): bigint {
  const line = (tokens: number, perMtok: bigint) => (BigInt(tokens) * perMtok) / PER_MILLION;
  return (
    line(usage.inputTokens, price.inputPerMtok) +
    line(usage.outputTokens, price.outputPerMtok) +
    line(usage.cacheReadTokens, price.cacheReadPerMtok) +
    line(usage.cacheWriteTokens, price.cacheWritePerMtok)
  );
}

export function crossedLevels(spend: bigint, limit: bigint): Array<80 | 100> {
  const levels: Array<80 | 100> = [];
  if (limit > 0n && spend * 100n >= limit * 80n) levels.push(80);
  if (limit > 0n && spend * 100n >= limit * 100n) levels.push(100);
  return levels;
}
