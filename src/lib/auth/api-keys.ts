import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "tl_";
const KEY_BYTES = 32;
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 8;

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const key = KEY_PREFIX + randomBytes(KEY_BYTES).toString("base64url");
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), keyHash: hashApiKey(key) };
}
