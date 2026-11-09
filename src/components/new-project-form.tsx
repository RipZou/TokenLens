"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm({ orgId }: { orgId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: new FormData(form).get("name") }),
    }).catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(response?.status === 403 ? "You can't create projects in this organization." : "Couldn't create the project. Try again.");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor={`project-name-${orgId}`} className="block text-sm font-medium">
          New project name
        </label>
        <input
          id={`project-name-${orgId}`}
          name="name"
          required
          maxLength={100}
          aria-invalid={error ? true : undefined}
          className="mt-1 rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
