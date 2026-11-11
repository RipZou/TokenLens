"use client";

export default function DocsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p role="alert" className="text-red-700">
        Couldn&apos;t load this page.
      </p>
      <button type="button" onClick={reset} className="mt-4 rounded border border-gray-300 bg-white px-4 py-2">
        Try again
      </button>
    </main>
  );
}
