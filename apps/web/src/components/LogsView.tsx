"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_LOG_FILTER,
  LOG_CATEGORIES,
  LOG_SEVERITIES,
  describeLogFilter,
  logFilterIsActive,
  type LogCategory,
  type LogFilter,
  type LogRecord,
  type LogSeverity
} from "@/lib/logger";

/**
 * The log view.
 *
 * The filter and the export use the same state, so what is downloaded is what
 * is on screen. Every filter is also written into the address bar, so a view
 * worth looking at twice can be linked.
 */

type Payload = {
  count: number;
  scanned: number;
  facets: { severities: LogSeverity[]; categories: LogCategory[]; sources: string[] };
  retention: Record<string, number>;
  entries: LogRecord[];
};

const SEVERITY_COLOUR: Record<string, string> = {
  FATAL: "text-red-700 bg-red-50 border-red-200",
  ERROR: "text-red-600 bg-red-50 border-red-200",
  WARN: "text-amber-700 bg-amber-50 border-amber-200",
  INFO: "text-slate-600 bg-slate-50 border-slate-200",
  DEBUG: "text-slate-500 bg-slate-50 border-slate-200",
  TRACE: "text-slate-400 bg-slate-50 border-slate-200"
};

export default function LogsView() {
  const [filter, setFilter] = useState<LogFilter>(EMPTY_LOG_FILTER);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tail, setTail] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filter.severities?.length) p.set("severity", filter.severities.join(","));
    if (filter.categories?.length) p.set("category", filter.categories.join(","));
    if (filter.source) p.set("source", filter.source);
    if (filter.actorCode) p.set("actor", filter.actorCode);
    if (filter.requestId) p.set("request", filter.requestId);
    if (filter.text?.trim()) p.set("q", filter.text.trim());
    if (filter.since) p.set("since", filter.since);
    if (filter.until) p.set("until", filter.until);
    return p.toString();
  }, [filter]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/logs?${query}`);
      if (res.status === 403) {
        setError("You do not have access to the logs.");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error("failed");
      setData((await res.json()) as Payload);
      setError(null);
    } catch {
      setError("Could not load the logs.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  // A tail, for watching something happen.
  useEffect(() => {
    if (!tail) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [tail, load]);

  useEffect(() => {
    const url = query ? `?${query}` : "";
    window.history.replaceState(null, "", `/logs${url}`);
  }, [query]);

  function toggle<T>(list: T[] | undefined, value: T): T[] | undefined {
    const cur = list ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    return next.length ? next : undefined;
  }

  function exportAs(format: "csv" | "txt" | "json") {
    window.location.href = `/api/logs?${query}&format=${format}&export=1`;
  }

  const facets = data?.facets;
  const filtering = logFilterIsActive(filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-ink-900">Logs</h1>
        {data && (
          <span className="text-xs text-ink-500">
            {data.count} of {data.scanned} in this window
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-700">
          <input type="checkbox" checked={tail} onChange={(e) => setTail(e.target.checked)} />
          Live tail
        </label>
        <button
          onClick={() => void load()}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-slate-200"
        >
          Refresh
        </button>
      </div>

      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}

      {/* ---- filters ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-900">Filter</h2>
          {filtering && (
            <>
              <span className="text-xs text-ink-500">{describeLogFilter(filter)}</span>
              <button
                onClick={() => setFilter(EMPTY_LOG_FILTER)}
                className="ml-auto rounded-lg bg-slate-100 px-2 py-1 text-xs text-ink-700 hover:bg-slate-200"
              >
                Clear
              </button>
            </>
          )}
        </div>

        <div className="space-y-3">
          <Chips
            label="Severity"
            options={facets?.severities ?? [...LOG_SEVERITIES].reverse()}
            selected={filter.severities ?? []}
            onToggle={(v) => setFilter((f) => ({ ...f, severities: toggle(f.severities, v as LogSeverity) }))}
          />
          <Chips
            label="Category"
            options={facets?.categories ?? [...LOG_CATEGORIES]}
            selected={filter.categories ?? []}
            onToggle={(v) => setFilter((f) => ({ ...f, categories: toggle(f.categories, v as LogCategory) }))}
          />
          {facets?.sources?.length ? (
            <Chips
              label="Source"
              options={facets.sources.slice(0, 20)}
              selected={filter.source ? [filter.source] : []}
              onToggle={(v) => setFilter((f) => ({ ...f, source: f.source === v ? undefined : v }))}
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="log-q" className="mb-1 block text-xs text-ink-500">Search</label>
              <input
                id="log-q"
                value={filter.text ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value || undefined }))}
                placeholder="message or metadata"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="log-since" className="mb-1 block text-xs text-ink-500">From</label>
              <input
                id="log-since"
                type="datetime-local"
                value={filter.since?.slice(0, 16) ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, since: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="log-request" className="mb-1 block text-xs text-ink-500">Request id</label>
              <input
                id="log-request"
                value={filter.requestId ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, requestId: e.target.value || undefined }))}
                placeholder="paste one from a report"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---- export ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-900">Export</h2>
        <p className="mb-3 text-xs text-ink-500">
          The export uses the filter above, so what you download is what you are looking at.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportAs("csv")} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
            Export CSV
          </button>
          <button onClick={() => exportAs("txt")} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-slate-200">
            Export text
          </button>
          <button onClick={() => exportAs("json")} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-slate-200">
            Export JSON
          </button>
        </div>
        {data && (
          <p className="mt-3 text-xs text-ink-500">
            Retention: {Object.entries(data.retention).map(([k, v]) => `${k} ${v}d`).join(" · ")}
          </p>
        )}
      </section>

      {/* ---- the list ---- */}
      <section className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-xs text-ink-500">Loading...</p>
        ) : !data || data.entries.length === 0 ? (
          <p className="p-4 text-xs text-ink-500">
            {filtering ? "Nothing matches this filter." : "No log entries yet."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.entries.map((r, i) => (
              <li key={`${r.ts}-${i}`} className="p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_COLOUR[r.severity] ?? ""}`}>
                    {r.severity}
                  </span>
                  <span className="text-[10px] font-medium text-ink-500">{r.category}</span>
                  <span className="text-[10px] text-ink-500">{r.ts}</span>
                  {r.source && <span className="text-[10px] text-ink-500">src={r.source}</span>}
                  {r.requestId && (
                    <button
                      onClick={() => setFilter((f) => ({ ...f, requestId: r.requestId ?? undefined }))}
                      className="text-[10px] text-brand-700 hover:underline"
                      title="Show everything from this request"
                    >
                      req={r.requestId.slice(0, 8)}
                    </button>
                  )}
                  {r.actorCode && (
                    <button
                      onClick={() => setFilter((f) => ({ ...f, actorCode: r.actorCode ?? undefined }))}
                      className="text-[10px] text-brand-700 hover:underline"
                      title="Show everything from this account"
                    >
                      {r.actorCode}
                    </button>
                  )}
                </div>
                <p className="mt-1 break-words font-mono text-xs text-ink-900">{r.message}</p>
                {Object.keys(r.metadata).length > 0 && (
                  <p className="mt-0.5 break-words font-mono text-[10px] text-ink-500">
                    {JSON.stringify(r.metadata)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Chips({
  label,
  options,
  selected,
  onToggle
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div>
      <span className="mb-1 block text-xs text-ink-500">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              className={`rounded-lg border px-2 py-1 text-xs ${
                on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-ink-700 hover:bg-slate-50"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
