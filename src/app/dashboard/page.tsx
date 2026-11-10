import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { LiveCalls } from "@/components/live-calls";
import { TodaySplit, UsageChart } from "@/components/usage-chart";
import { requirePageUser } from "@/lib/auth/page-session";
import { callDependencies } from "@/lib/auth/route-deps";
import { RANGE_LABELS, formatTokens } from "@/lib/dashboard/categories";
import { TIME_RANGES, loadDashboard, type DashboardData, type TimeRange } from "@/lib/services/calls";

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rangeHref(dashboard: DashboardData, range: TimeRange): string {
  const params = new URLSearchParams();
  if (dashboard.projectId) params.set("project", dashboard.projectId);
  if (dashboard.agent) params.set("agent", dashboard.agent);
  if (dashboard.model) params.set("model", dashboard.model);
  params.set("range", range);
  return `/dashboard?${params.toString()}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePageUser();
  const deps = callDependencies();
  if (deps instanceof Response) throw new Error("Server is not configured");
  const params = await searchParams;
  const loaded = await loadDashboard(
    session.sub,
    {
      projectId: first(params.project),
      agent: first(params.agent),
      model: first(params.model),
      range: first(params.range),
    },
    new Date(),
    deps,
  );

  return (
    <>
      <AppHeader current="/dashboard" email={session.email} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {loaded.status === 403 ? (
          <p role="alert" className="rounded-lg bg-white p-6 text-red-700 shadow-sm">
            You don&apos;t have access to that project.{" "}
            <Link href="/dashboard" className="text-blue-700 underline">
              Back to your projects
            </Link>
          </p>
        ) : (
          <DashboardView dashboard={loaded.dashboard} />
        )}
      </main>
    </>
  );
}

function DashboardView({ dashboard }: { dashboard: DashboardData }) {
  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow-sm" aria-label="Call filters">
        <label className="flex flex-col gap-1 text-sm">
          Project
          <select name="project" defaultValue={dashboard.projectId ?? ""} className="rounded border border-gray-300 bg-white px-3 py-2">
            <option value="">All projects</option>
            {dashboard.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Agent
          <select name="agent" defaultValue={dashboard.agent ?? ""} className="rounded border border-gray-300 bg-white px-3 py-2">
            <option value="">All agents</option>
            {dashboard.agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Model
          <select name="model" defaultValue={dashboard.model ?? ""} className="rounded border border-gray-300 bg-white px-3 py-2">
            <option value="">All models</option>
            {dashboard.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="range" value={dashboard.range} />
        <button type="submit" className="rounded bg-blue-700 px-4 py-2 text-white">
          Apply
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-sm text-gray-600">Input tokens</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatTokens(dashboard.totals.inputTokens)}</p>
          <p className="mt-1 text-sm text-gray-600">{formatTokens(dashboard.totals.calls)} calls</p>
        </article>
        <article className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-sm text-gray-600">Output tokens</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatTokens(dashboard.totals.outputTokens)}</p>
          <p className="mt-1 text-sm text-gray-600">text · tool_use · thinking</p>
        </article>
        <article className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="text-sm text-gray-600">Cost</h2>
          <p className="mt-2 text-3xl font-bold">unavailable</p>
          <p className="mt-1 text-sm text-gray-600">No model price is set</p>
        </article>
      </section>

      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-[2_1_36rem]">
          <UsageChart
            buckets={dashboard.buckets}
            title={`Input tokens by category, last ${RANGE_LABELS[dashboard.range]}`}
            actions={
              <div role="group" aria-label="Time range" className="flex gap-1">
                {TIME_RANGES.map((range) => (
                  <Link
                    key={range}
                    href={rangeHref(dashboard, range)}
                    aria-pressed={dashboard.range === range}
                    className="rounded border border-gray-300 px-3 py-2 text-sm aria-pressed:border-blue-700 aria-pressed:bg-blue-50 aria-pressed:font-semibold aria-pressed:text-blue-800"
                  >
                    {RANGE_LABELS[range]}
                  </Link>
                ))}
              </div>
            }
          />
        </div>
        <div className="min-w-0 flex-[1_1_20rem]">
          <TodaySplit totals={dashboard.today} />
        </div>
      </div>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Recent calls</h2>
        <p className="mt-1 text-sm text-gray-600">New calls appear at the top without a refresh. Open a row for its breakdown.</p>
        <LiveCalls
          key={[dashboard.projectId ?? "all", dashboard.agent ?? "", dashboard.model ?? "", dashboard.range].join("|")}
          calls={dashboard.calls}
          projectIds={dashboard.projectId ? [dashboard.projectId] : dashboard.projects.map((project) => project.id)}
          agent={dashboard.agent}
          model={dashboard.model}
        />
      </section>
    </>
  );
}
