export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4">
      <section className="w-full rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">TokenLens</h1>
        <p className="mt-2 text-gray-700">
          Track reported model calls, see which parts of the input context use tokens, and
          monitor spending.
        </p>
      </section>
    </main>
  );
}
