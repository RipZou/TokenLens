"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { parseUsd } from "@/lib/budgets/money";
import { BUDGET_POLL_MS } from "@/lib/budgets/period";

export type BudgetSnapshot = {
  timeZone: string;
  day: { start: string; end: string };
  month: { start: string; end: string };
  budgets: { period: "day" | "month"; limitUsd: string; spendUsd: string }[];
  alerts: {
    id: string;
    level: number;
    period: string;
    periodStart: string;
    triggeredAt: string;
    spendUsd: string;
    limitUsd: string;
  }[];
};

export function BudgetPanel({
  orgId,
  orgName,
  canEdit,
}: {
  orgId: string;
  orgName: string;
  canEdit: boolean;
}) {
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch(`/api/orgs/${orgId}/budgets`).catch(() => null);
      if (!active) return;
      if (!response?.ok) {
        setError("Couldn't load budgets.");
        return;
      }
      setSnapshot((await response.json()) as BudgetSnapshot);
      setError(null);
    }
    void load();
    const timer = window.setInterval(() => void load(), BUDGET_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [orgId]);

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{orgName}</h2>
      {error ? (
        <p role="alert" className="mt-3 text-red-700">
          {error}
        </p>
      ) : null}
      {!snapshot && !error ? <p className="mt-3 text-gray-700">Loading budgets…</p> : null}
      {snapshot ? (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <PeriodCard orgId={orgId} period="day" label="Daily budget" snapshot={snapshot} canEdit={canEdit} />
            <PeriodCard orgId={orgId} period="month" label="Monthly budget" snapshot={snapshot} canEdit={canEdit} />
          </div>
          <AlertHistory alerts={snapshot.alerts} />
        </div>
      ) : null}
    </section>
  );
}

function PeriodCard({
  orgId,
  period,
  label,
  snapshot,
  canEdit,
}: {
  orgId: string;
  period: "day" | "month";
  label: string;
  snapshot: BudgetSnapshot;
  canEdit: boolean;
}) {
  const budget = snapshot.budgets.find((item) => item.period === period);
  const window = period === "day" ? snapshot.day : snapshot.month;
  return (
    <div>
      <h3 className="font-semibold">{label}</h3>
      <p className="mt-1 text-sm text-gray-600">
        {window.start} to {window.end} ({snapshot.timeZone})
      </p>
      {budget ? (
        <Progress spendUsd={budget.spendUsd} limitUsd={budget.limitUsd} />
      ) : (
        <p className="mt-3 text-gray-700">No {period} limit yet.</p>
      )}
      {canEdit ? <LimitForm orgId={orgId} period={period} current={budget?.limitUsd ?? ""} /> : null}
    </div>
  );
}

function Progress({ spendUsd, limitUsd }: { spendUsd: string; limitUsd: string }) {
  const ratio = ratioOf(spendUsd, limitUsd);
  const width = Math.min(100, ratio);
  const level = ratio >= 100 ? "100%" : ratio >= 80 ? "80%" : "under 80%";
  return (
    <div className="mt-3">
      <p className="text-2xl font-semibold">
        ${trimUsd(spendUsd)} <span className="text-base font-normal text-gray-600">of ${trimUsd(limitUsd)}</span>
      </p>
      <div className="mt-3 h-3.5 overflow-hidden rounded bg-gray-200" role="img" aria-label={`${ratio.toFixed(1)} percent of the limit, ${level}`}>
        <div className={`h-full ${ratio >= 80 ? "bg-amber-500" : "bg-blue-600"}`} style={{ width: `${width}%` }} />
      </div>
      <div className="relative mt-1 h-5 text-xs text-gray-600">
        <span className="absolute left-[80%] -translate-x-1/2">80%</span>
        <span className="absolute right-0">100%</span>
      </div>
      <p className="text-sm text-gray-700">
        {ratio.toFixed(1)}% used · {level}
      </p>
    </div>
  );
}

function LimitForm({ orgId, period, current }: { orgId: string; period: "day" | "month"; current: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const limitUsd = String(new FormData(form).get("limitUsd") ?? "");
    setPending(true);
    setError(null);
    setSaved(null);
    const response = await fetch(`/api/orgs/${orgId}/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ period, limitUsd }),
    }).catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(response?.status === 403 ? "Only Admins can change budgets." : "Couldn't save the budget. Try again.");
      return;
    }
    setSaved("Saved.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor={`${period}-limit-${orgId}`} className="block text-sm font-medium">
          Limit (USD)
        </label>
        <input
          id={`${period}-limit-${orgId}`}
          name="limitUsd"
          required
          inputMode="decimal"
          defaultValue={current ? trimUsd(current) : ""}
          aria-invalid={error ? true : undefined}
          className="mt-1 rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <button type="submit" disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Saving…" : "Save budget"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="w-full text-sm text-gray-700">
          {saved}
        </p>
      ) : null}
    </form>
  );
}

function AlertHistory({ alerts }: { alerts: BudgetSnapshot["alerts"] }) {
  return (
    <div>
      <h3 className="font-semibold">Alert history</h3>
      {alerts.length === 0 ? (
        <p className="mt-3 text-sm text-gray-600">No alerts yet. Each 80% and 100% threshold fires once per budget period.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-gray-600">
              <th className="py-1 pr-3 font-medium">When</th>
              <th className="py-1 pr-3 font-medium">Level</th>
              <th className="py-1 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id} className="border-t border-gray-100">
                <td className="py-2 pr-3">{alert.triggeredAt}</td>
                <td className="py-2 pr-3">{alert.level}%</td>
                <td className="py-2">
                  {alert.period} · ${trimUsd(alert.spendUsd)} of ${trimUsd(alert.limitUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function BudgetNotifier({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [alerts, setAlerts] = useState<BudgetSnapshot["alerts"]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (orgs.length === 0) return;
    let seen = new Set<string>();
    let ready = false;
    let active = true;

    async function poll() {
      const pages = await Promise.all(
        orgs.map(async (org) => {
          const response = await fetch(`/api/orgs/${org.id}/budgets`).catch(() => null);
          if (!response?.ok) return [] as BudgetSnapshot["alerts"];
          const body = (await response.json()) as BudgetSnapshot;
          return body.alerts;
        }),
      );
      if (!active) return;
      const next = pages.flat().sort((left, right) => right.triggeredAt.localeCompare(left.triggeredAt));
      const fresh = next.filter((alert) => !seen.has(alert.id));
      seen = new Set(next.map((alert) => alert.id));
      setAlerts(next);
      if (ready && fresh.length > 0) {
        const newest = fresh[0];
        setToast(`Budget alert: ${newest.level}% of the ${newest.period} limit`);
      }
      ready = true;
    }

    void poll();
    const timer = window.setInterval(() => void poll(), BUDGET_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [orgs]);

  const banner = alerts.find((alert) => !dismissed.includes(alert.id));

  return (
    <>
      {banner ? (
        <div className="border-b border-amber-300 bg-amber-50" role="status">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <p className="text-amber-950">
              <span className="font-semibold">Budget alert.</span> {banner.level}% of the {banner.period} limit · $
              {trimUsd(banner.spendUsd)} of ${trimUsd(banner.limitUsd)}
            </p>
            <button
              type="button"
              className="ml-auto rounded border border-amber-400 bg-white px-3 py-1 text-sm"
              onClick={() => setDismissed((current) => [...current, banner.id])}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed right-4 bottom-4 z-20 max-w-sm rounded-lg border border-amber-300 bg-white p-4 shadow-lg" role="status">
          <p className="font-semibold text-amber-950">Budget alert</p>
          <p className="mt-1 text-sm text-gray-800">{toast}</p>
          <button type="button" className="mt-3 text-sm text-blue-700 underline" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}

export function ModelPriceForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSaved(null);
    const response = await fetch("/api/model-prices", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: data.get("model"),
        inputPerMtok: data.get("inputPerMtok"),
        outputPerMtok: data.get("outputPerMtok"),
      }),
    }).catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(response?.status === 403 ? "Only Admins can set model prices." : "Couldn't save the price. Try again.");
      return;
    }
    setSaved("Price saved. Calls for an unknown model stay unpriced and do not count toward a budget.");
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Model price</h2>
      <p className="mt-1 text-sm text-gray-600">USD per million tokens. Cache reads and writes are $0 unless a later price sets them.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field id="price-model" name="model" label="Model" />
        <Field id="price-input" name="inputPerMtok" label="Input per million" />
        <Field id="price-output" name="outputPerMtok" label="Output per million" />
        <button type="submit" disabled={pending} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save price"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mt-3 text-sm text-gray-700">
          {saved}
        </p>
      ) : null}
    </form>
  );
}

function Field({ id, name, label }: { id: string; name: string; label: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} name={name} required className="mt-1 rounded border border-gray-300 px-3 py-2" />
    </div>
  );
}

function ratioOf(spendUsd: string, limitUsd: string): number {
  const spend = parseUsd(spendUsd);
  const limit = parseUsd(limitUsd);
  if (spend === null || limit === null || limit === 0n) return 0;
  return Number((spend * 10000n) / limit) / 100;
}

function trimUsd(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}
