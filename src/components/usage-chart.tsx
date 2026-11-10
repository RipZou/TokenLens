import type { ReactNode } from "react";
import { CATEGORY_COLORS, categoryNames, formatTokens } from "@/lib/dashboard/categories";
import type { ChartBucket, CategoryTotal } from "@/lib/services/calls";

export function UsageChart({ buckets, title, actions }: { buckets: ChartBucket[]; title: string; actions?: ReactNode }) {
  const max = Math.max(...buckets.map((bucket) => bucket.totals.reduce((sum, item) => sum + item.tokens, 0)), 0);
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions ? <div className="ml-auto">{actions}</div> : null}
      </div>
      <div
        className="mt-5 flex h-56 items-end gap-2 border-b border-gray-300"
        role="img"
        aria-label="Input tokens stacked by category"
      >
        {buckets.map((bucket, index) => {
          const total = bucket.totals.reduce((sum, item) => sum + item.tokens, 0);
          return (
            <div key={`${bucket.label}-${index}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="flex flex-col-reverse overflow-hidden rounded-t" style={{ height: max === 0 ? 0 : `${(total / max) * 100}%` }}>
                {bucket.totals.map((item) => (
                  <div
                    key={item.category}
                    title={`${item.category}: ${formatTokens(item.tokens)}`}
                    style={{ flexGrow: item.tokens, backgroundColor: CATEGORY_COLORS[item.category] }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 text-xs text-gray-600">
        {buckets.map((bucket, index) => (
          <span key={`${bucket.label}-${index}`} className="min-w-0 flex-1 truncate text-center">
            {bucket.label}
          </span>
        ))}
      </div>
      <ul className="mt-4 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-xs">
        {categoryNames().map((category) => (
          <li key={category} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[category] }} />
            <span className="font-mono">{category}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <caption className="mb-2 text-left text-sm text-gray-700">Input tokens by category</caption>
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="py-2 pr-3 font-semibold">Time</th>
              {categoryNames().map((category) => (
                <th key={category} className="px-2 py-2 text-right font-mono text-xs font-semibold">
                  {category}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket, index) => (
              <tr key={`${bucket.label}-${index}`} className="border-b border-gray-100">
                <td className="py-2 pr-3">{bucket.label}</td>
                {bucket.totals.map((item) => (
                  <td key={item.category} className="px-2 py-2 text-right tabular-nums">
                    {formatTokens(item.tokens)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TodaySplit({ totals }: { totals: CategoryTotal[] }) {
  const sum = totals.reduce((total, item) => total + item.tokens, 0);
  const max = Math.max(...totals.map((item) => item.tokens), 0);
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Where today&apos;s input went</h2>
      <ul className="mt-4 space-y-3">
        {totals.map((item) => {
          const share = sum === 0 ? 0 : item.tokens / sum;
          return (
            <li key={item.category} className="grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
              <span className="font-mono text-gray-700">{item.category}</span>
              <span className="h-2.5 rounded bg-gray-100">
                <span
                  className="block h-2.5 rounded"
                  style={{
                    width: max === 0 ? 0 : `${(item.tokens / max) * 100}%`,
                    backgroundColor: CATEGORY_COLORS[item.category],
                  }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums">{Math.round(share * 100)}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
