"use client";

import { useState } from "react";

export type KeyRow = { id: string; prefix: string; createdAt: string; revokedAt: string | null };

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function toRow(payload: unknown): KeyRow | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { id, prefix, createdAt, revokedAt } = payload as Record<string, unknown>;
  if (typeof id !== "string" || typeof prefix !== "string" || typeof createdAt !== "string") return null;
  return { id, prefix, createdAt, revokedAt: typeof revokedAt === "string" ? revokedAt : null };
}

export function ApiKeysPanel({
  projectId,
  initialKeys,
  canManage,
}: {
  projectId: string;
  initialKeys: KeyRow[];
  canManage: boolean;
}) {
  const [keys, setKeys] = useState(initialKeys);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send(method: "POST" | "DELETE", path: string): Promise<unknown> {
    setPending(true);
    setError(null);
    setStatus(null);
    const response = await fetch(path, { method }).catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError("That didn't work. Refresh the page and try again.");
      return null;
    }
    return response.json();
  }

  async function createKey() {
    const payload = await send("POST", `/api/projects/${projectId}/keys`);
    const row = toRow(payload);
    const key = (payload as { key?: unknown } | null)?.key;
    if (!row || typeof key !== "string") return;
    setKeys((current) => [row, ...current]);
    setNewKey(key);
  }

  async function revokeKey(keyId: string) {
    const row = toRow(await send("DELETE", `/api/projects/${projectId}/keys/${keyId}`));
    if (!row) return;
    setKeys((current) => current.map((key) => (key.id === row.id ? row : key)));
    setStatus("Key revoked. Calls using it now get 401.");
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey).then(
      () => setStatus("Copied."),
      () => setError("Couldn't copy. Select the key and copy it manually."),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {canManage ? (
          <button
            type="button"
            onClick={createKey}
            disabled={pending}
            className="ml-auto rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            Create key
          </button>
        ) : (
          <p className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
            Only Admins and the project&apos;s creator can create or revoke keys.
          </p>
        )}
      </div>

      {newKey ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h2 className="font-semibold">Copy your new key now</h2>
          <p className="mt-1 text-gray-800">This is the only time the full key is shown. We store only its hash.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code data-testid="new-key" className="break-all rounded border border-gray-200 bg-white px-3 py-2 font-mono text-sm">
              {newKey}
            </code>
            <button type="button" onClick={copyKey} className="rounded border border-gray-300 bg-white px-4 py-2">
              Copy
            </button>
            <button type="button" onClick={() => setNewKey(null)} className="rounded border border-gray-300 bg-white px-4 py-2">
              I&apos;ve saved it
            </button>
          </div>
        </section>
      ) : null}

      <p role="status" className="text-sm text-gray-700">
        {status}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-lg bg-white p-5 shadow-sm">
        {keys.length === 0 ? (
          <p className="text-gray-700">No keys yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-gray-600">
              <tr>
                <th className="py-2 font-medium">Key</th>
                <th className="py-2 font-medium">Created</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keys.map((key) => (
                <tr key={key.id}>
                  <td className="py-2 font-mono">{key.prefix}…</td>
                  <td className="py-2">{DATE_FORMAT.format(new Date(key.createdAt))}</td>
                  <td className="py-2">{key.revokedAt ? "Revoked" : "Active"}</td>
                  <td className="py-2 text-right">
                    {canManage && !key.revokedAt ? (
                      <button
                        type="button"
                        onClick={() => revokeKey(key.id)}
                        disabled={pending}
                        aria-label={`Revoke key ${key.prefix}`}
                        className="rounded border border-red-200 px-3 py-1 text-red-800 disabled:opacity-60"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-sm text-gray-600">
          Agents send the key as <code className="font-mono">Authorization: Bearer tl_…</code> to{" "}
          <code className="font-mono">POST /api/v1/events</code>.
        </p>
      </section>
    </div>
  );
}
