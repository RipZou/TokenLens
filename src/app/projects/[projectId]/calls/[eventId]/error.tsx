"use client";

export default function CallDetailError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p role="alert" className="text-red-700">
        Couldn&apos;t load this call.
      </p>
      <button type="button" onClick={reset} className="mt-4 rounded border border-gray-300 bg-white px-4 py-2">
        Try again
      </button>
    </main>
  );
}