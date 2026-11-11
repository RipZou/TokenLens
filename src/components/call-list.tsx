import Link from "next/link";
import { displayUsd } from "@/lib/budgets/money";
import { formatCallTime, formatTokens } from "@/lib/dashboard/categories";
import type { CallListItem } from "@/lib/services/calls";

export function CallList({ calls }: { calls: CallListItem[] }) {
  if (calls.length === 0) {
    return <p className="mt-4 text-gray-700">No calls in this range.</p>;
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-[760px] w-full text-sm">
        <caption className="sr-only">Recent calls</caption>
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-2 pr-3 font-semibold">Time</th>
            <th className="py-2 pr-3 font-semibold">Agent</th>
            <th className="py-2 pr-3 font-semibold">Model</th>
            <th className="py-2 pr-3 text-right font-semibold">Input</th>
            <th className="py-2 pr-3 text-right font-semibold">Output</th>
            <th className="py-2 pr-3 font-semibold">Largest category</th>
            <th className="py-2 text-right font-semibold">Cost</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.id} className="border-b border-gray-100">
              <td className="py-2 pr-3">
                <Link href={`/projects/${call.projectId}/calls/${call.id}`} className="text-blue-700 underline">
                  {formatCallTime(call.createdAt)}
                </Link>
                {call.estimated ? <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">estimated</span> : null}
              </td>
              <td className="py-2 pr-3">{call.agentName}</td>
              <td className="py-2 pr-3 font-mono">{call.model}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatTokens(call.inputTokens)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatTokens(call.outputTokens)}</td>
              <td className="py-2 pr-3 font-mono">{call.largestCategory}</td>
              <td className="py-2 text-right">{displayUsd(call.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
