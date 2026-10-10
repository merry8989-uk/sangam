"use client";

import { useState } from "react";
import {
  primaryButtonAction,
  primaryButtonHint,
  primaryButtonLabel,
  type PrimaryState
} from "@/lib/connect";
import type { PrimaryAction } from "@/lib/postDisplay";

/**
 * The one main button on a profile or post. It renders whichever interaction
 * the viewer picked in the three-dot menu - Connect, Follow or Subscribe - and
 * reports the resulting state through onChange so the menu stays in step.
 */
export default function PrimaryActionButton({
  targetId,
  action,
  initialState = "NONE",
  onChange
}: {
  targetId: string;
  action: PrimaryAction;
  initialState?: PrimaryState;
  onChange?: (state: PrimaryState) => void;
}) {
  const [state, setState] = useState<PrimaryState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = primaryButtonLabel(action, state);
  const hint = primaryButtonHint(action, state);
  const active = state === "ACTIVE";

  async function press() {
    setBusy(true);
    setError(null);
    const next = primaryButtonAction(action, state);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, action: next })
      });
      if (!res.ok) throw new Error("failed");

      // Mirror what the server just did, so the button settles without a reload.
      const settled: PrimaryState =
        next === "connect"
          ? "PENDING_OUT"
          : next === "follow" || next === "subscribe" || next === "accept"
            ? "ACTIVE"
            : "NONE";
      setState(settled);
      onChange?.(settled);
    } catch {
      setError("That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={press}
        disabled={busy}
        title={hint}
        className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
          active
            ? "border border-slate-300 text-ink-700 hover:bg-slate-50"
            : state === "PENDING_OUT"
              ? "border border-slate-300 text-ink-500"
              : "bg-brand-600 text-white hover:bg-brand-700"
        }`}
      >
        {busy ? "..." : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
