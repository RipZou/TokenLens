import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requirePageUser } from "@/lib/auth/page-session";
import { callDependencies } from "@/lib/auth/route-deps";
import { CATEGORY_COLORS, formatCallTime, formatShare, formatTokens } from "@/lib/dashboard/categories";
import { optimizationHints } from "@/lib/dashboard/hints";
import { loadCallDetail } from "@/lib/services/calls";

export default async function CallDetailPage({ params }: { params: Promise<{ projectId: string; eventId: string }> }) {
  const session = await requirePageUser();
  const deps = callDependencies();
  if (deps instanceof Response) throw new Error("Server is not configured");
  const { projectId, eventId } = await params;
  const call = await loadCallDetail(session.sub, projectId, eventId, deps);

  return (
    <>
      <AppHeader current="/dashboard" email={session.email} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        {call === null ? (
          <p role="alert" className="rounded-lg bg-white p-6 text-red-700 shadow-sm">
            This call isn&apos;t available.{" "}
            <Link href="/dashboard" className="text-blue-700 underline">
              Back to the dashboard
            </Link>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/dashboard?project=${call.projectId}`} className="rounded border border-gray-300 bg-white px-3 py-2">
                ← Back to dashboard
              </Link>
              <h1 className="text-2xl font-semibold">
                Call {formatCallTime(call.createdAt)} · {call.agentName}
              </h1>
              {call.estimated ? <span className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-800">estimated</span> : null}
            </div>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-lg bg-white p-5 shadow-sm">
                <h2 className="text-sm text-gray-600">Input tokens</h2>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatTokens(call.inputTokens)}</p>
                <p className="mt-1 font-mono text-sm text-gray-600">{call.model}</p>
              </article>
              <article className="rounded-lg bg-white p-5 shadow-sm">
                <h2 className="text-sm text-gray-600">Output tokens</h2>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatTokens(call.outputTokens)}</p>
                <p className="mt-1 text-sm text-gray-600">
                  text {formatTokens(call.output.text)} · tool_use {formatTokens(call.output.tool_use)} · thinking{" "}
                  {formatTokens(call.output.thinking)}
                </p>
              </article>
              <article className="rounded-lg bg-white p-5 shadow-sm">
                <h2 className="text-sm text-gray-600">Cache read</h2>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatTokens(call.cacheReadTokens)}</p>
                <p className="mt-1 text-sm text-gray-600">
                  Cache write {formatTokens(call.cacheWriteTokens)}. Not part of the category split.
                </p>
              </article>
              <article className="rounded-lg bg-white p-5 shadow-sm">
                <h2 className="text-sm text-gray-600">Cost</h2>
                <p className="mt-2 text-3xl font-bold">unavailable</p>
                <p className="mt-1 text-sm text-gray-600">No model price is set</p>
              </article>
            </section>
            <section className="rounded-lg bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Input breakdown</h2>
              <div className="mt-4 flex h-7 overflow-hidden rounded" role="img" aria-label="Input tokens split by category">
                {call.input.map((item) => (
                  <div
                    key={item.category}
                    title={`${item.category}: ${formatTokens(item.tokens)}`}
                    style={{ width: `${item.share * 100}%`, backgroundColor: CATEGORY_COLORS[item.category] }}
                  />
                ))}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[560px] w-full text-sm">
                  <caption className="sr-only">Category token counts and cost</caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2 pr-3 font-semibold">Category</th>
                      <th className="py-2 pr-3 text-right font-semibold">Tokens</th>
                      <th className="py-2 pr-3 text-right font-semibold">Share</th>
                      <th className="py-2 text-right font-semibold">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {call.input.map((item) => (
                      <tr key={item.category} className="border-b border-gray-100">
                        <td className="py-2 pr-3">
                          <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ backgroundColor: CATEGORY_COLORS[item.category] }} />
                          <span className="font-mono">{item.category}</span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatTokens(item.tokens)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{formatShare(item.share)}</td>
                        <td className="py-2 text-right">unavailable</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 pr-3 font-semibold">Total</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatTokens(call.inputTokens)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">100%</td>
                      <td className="py-2 text-right">unavailable</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-gray-700">
                Categories sum to the reported input tokens. Cost stays unavailable until a model price is set.
              </p>
            </section>
            <Hints input={call.input} inputTokens={call.inputTokens} />
            <Topics topics={call.topics} />
          </>
        )}
      </main>
    </>
  );
}

function Hints({ input, inputTokens }: { input: { category: string; tokens: number }[]; inputTokens: number }) {
  const hints = optimizationHints(input, inputTokens);
  if (hints.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-6" aria-label="Optimization hints">
      <h2 className="text-lg font-semibold text-amber-950">Optimization hints</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-amber-950">
        {hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ul>
    </section>
  );
}

function Topics({ topics }: { topics: { topic: string; tokens: number }[] }) {
  if (topics.length === 0) return null;
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm" aria-label="Topic tags">
      <h2 className="text-lg font-semibold">Topics</h2>
      <p className="mt-1 text-sm text-gray-600">These labels are separate from the structural categories above.</p>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-2 pr-3 font-semibold">Topic</th>
            <th className="py-2 text-right font-semibold">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.topic} className="border-b border-gray-100">
              <td className="py-2 pr-3">{topic.topic}</td>
              <td className="py-2 text-right tabular-nums">{topic.tokens}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
