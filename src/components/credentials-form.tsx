"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type CredentialsFormProps = {
  endpoint: string;
  submitLabel: string;
  alternateHref: string;
  alternateLabel: string;
};

function errorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return "Something went wrong. Try again.";
}

export function CredentialsForm({
  endpoint,
  submitLabel,
  alternateHref,
  alternateLabel,
}: CredentialsFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    const body = new FormData(form);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: body.get("email"),
          password: body.get("password"),
        }),
      });
      if (!response.ok) {
        setError(errorMessage(await response.json().catch(() => null)));
        setPending(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={error ? true : undefined}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={endpoint.endsWith("register") ? "new-password" : "current-password"}
          required
          minLength={8}
          aria-invalid={error ? true : undefined}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Please wait…" : submitLabel}
      </button>
      <p className="text-sm text-gray-700">
        <a href={alternateHref} className="text-blue-700 underline">
          {alternateLabel}
        </a>
      </p>
    </form>
  );
}
