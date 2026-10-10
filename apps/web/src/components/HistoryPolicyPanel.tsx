"use client";

import { useEffect, useState } from "react";
import {
  HISTORY_MODES,
  clampDays,
  historySettingsPatch,
  modeHint,
  modeLabel,
  resolveHistoryPolicy,
  usesPeriod,
  type HistoryMode,
  type HistoryPolicy,
  type HistoryType
} from "@/lib/history";

/**
 * The history policy controls, for the Settings page.
 *
 * Watch and search are set separately, because wanting one and not the other is
 * normal. Each offers four modes: keep, delete after a period, archive after a
 * period, or do not record at all.
 */
export default function HistoryPolicyPanel() {
  const [policy, setPolicy] = useState<Record<HistoryType, HistoryPolicy> | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.settings) setPolicy(resolveHistoryPolicy(d.settings));
      })
      .catch(() => setNote("Could not load your settings."));
  }, []);

  async function save(type: HistoryType, next: HistoryPolicy, revert: HistoryPolicy) {
    if (!policy) return;
    setPolicy({ ...policy, [type]: next });
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(historySettingsPatch(type, next))
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setPolicy({ ...policy, [type]: revert });
      setNote("Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  if (!policy) {
    return <p className="text-sm text-ink-500">{note ?? "Loading..."}</p>;
  }

  return (
    <div className="space-y-5">
      {note && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{note}</p>}
      {(["watch", "search"] as HistoryType[]).map((type) => (
        <HistoryTypeControl
          key={type}
          type={type}
          value={policy[type]}
          saving={saving}
          onChange={(next) => save(type, next, policy[type])}
        />
      ))}
      <p className="text-xs text-ink-500">
        History is stored in the database, not only in cache, so restarting your device or the
        server does not lose it. {saving ? "Saving..." : ""}
      </p>
    </div>
  );
}

function HistoryTypeControl({
  type,
  value,
  saving,
  onChange
}: {
  type: HistoryType;
  value: HistoryPolicy;
  saving: boolean;
  onChange: (next: HistoryPolicy) => void;
}) {
  const label = type === "watch" ? "Watch history" : "Search history";

  function setMode(mode: HistoryMode) {
    onChange({ mode, days: clampDays(value.days) });
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink-900">{label}</legend>
      <div className="space-y-1">
        {HISTORY_MODES.map((m) => (
          <label
            key={m}
            className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
          >
            <input
              type="radio"
              name={`historyMode-${type}`}
              className="mt-0.5"
              checked={value.mode === m}
              onChange={() => setMode(m)}
            />
            <span>
              <span className="block text-sm text-ink-900">{modeLabel(m)}</span>
              <span className="block text-xs text-ink-500">{modeHint(m, type)}</span>
            </span>
          </label>
        ))}
      </div>

      {usesPeriod(value.mode) && (
        <div className="mt-2 flex items-center gap-2 pl-2">
          <label className="text-xs text-ink-700" htmlFor={`days-${type}`}>
            After
          </label>
          <input
            id={`days-${type}`}
            type="number"
            min={1}
            max={3650}
            value={value.days}
            disabled={saving}
            onChange={(e) => onChange({ mode: value.mode, days: clampDays(Number(e.target.value)) })}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-ink-700">days</span>
        </div>
      )}
    </fieldset>
  );
}
