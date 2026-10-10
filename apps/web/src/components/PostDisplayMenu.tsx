"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PRIMARY_ACTIONS,
  type PrimaryAction,
  primaryActionHint,
  primaryActionLabel,
  togglesFor,
  displayPatch,
  DEFAULT_DISPLAY,
  type PostDisplay,
  type DisplayKey,
  type DisplayToggle
} from "@/lib/postDisplay";

/**
 * The three-dot menu on a post.
 *
 * It writes the display preferences: which action the primary button offers,
 * which metadata is visible, and which interface elements are drawn.
 *
 * The switch state is optimistic - the toggle flips at once, then the write
 * goes out. If the write fails the toggle goes back and an error shows, so the
 * menu never quietly disagrees with what is stored.
 *
 * These are account-wide preferences, not per-post, so after a successful
 * write we refresh the route to redraw every post on the page.
 */
export default function PostDisplayMenu({ initial }: { initial: PostDisplay }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState<PostDisplay>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  async function save(next: PostDisplay, revert: PostDisplay) {
    setDisplay(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(displayPatch(next))
      });
      if (!res.ok) throw new Error("save failed");
      // redraw the posts on the page with the new preferences
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 350);
    } catch {
      setDisplay(revert);
      setError("Could not save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function flip(key: DisplayKey) {
    void save({ ...display, [key]: !display[key] }, display);
  }

  // Focus mode is not one of the per-element toggles, so it gets its own
  // handler rather than being forced through DisplayKey.
  function flipFocus() {
    void save({ ...display, focusMode: !display.focusMode }, display);
  }

  function setAction(action: PrimaryAction) {
    if (action === display.primaryAction) return;
    void save({ ...display, primaryAction: action }, display);
  }

  function reset() {
    void save({ ...DEFAULT_DISPLAY }, display);
  }

  const metadata = togglesFor("metadata");
  const elements = togglesFor("elements");

  return (
    <div className="relative ml-auto" ref={box}>
      <button
        type="button"
        aria-label="Post display settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-2 py-1 text-lg leading-none text-ink-500 hover:bg-slate-100 hover:text-ink-900"
      >
        ⋯
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Post display settings"
          className="absolute right-0 z-30 mt-1 max-h-[70vh] w-[22rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-900">How your posts look</h3>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-ink-500 underline hover:text-ink-900"
            >
              Reset
            </button>
          </div>
          <p className="mb-3 text-xs text-ink-500">
            These apply everywhere, not just this post. The ⋯ button always stays.
          </p>

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          {/* ---- primary interaction ---- */}
          <section className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Main button
            </h4>
            <div className="space-y-1">
              {PRIMARY_ACTIONS.map((a) => (
                <label
                  key={a}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                >
                  <input
                    type="radio"
                    name="primaryAction"
                    className="mt-0.5"
                    checked={display.primaryAction === a}
                    onChange={() => setAction(a)}
                  />
                  <span>
                    <span className="block text-sm text-ink-900">{primaryActionLabel(a, false)}</span>
                    <span className="block text-xs text-ink-500">{primaryActionHint(a)}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* ---- focus mode ---- */}
          <section className="mb-4">
            <ToggleRow
              toggle={{
                key: "likeCount",
                settingKey: "focusMode",
                label: "Focus mode",
                group: "metadata",
                hint: "Hides every count at once, until you switch it off."
              }}
              label="Focus mode"
              hint="Hides every count at once, until you switch it off."
              checked={display.focusMode}
              onToggle={flipFocus}
            />
          </section>

          {/* ---- metadata ---- */}
          <section className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              What to show
            </h4>
            <div className="space-y-1">
              {metadata.map((t) => (
                <ToggleRow
                  key={t.key}
                  toggle={t}
                  checked={display[t.key]}
                  dimmed={display.focusMode && t.key !== "caption"}
                  note={display.focusMode && t.key !== "caption" ? "hidden by focus mode" : undefined}
                  onToggle={() => flip(t.key)}
                />
              ))}
            </div>
          </section>

          {/* ---- interface elements ---- */}
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Interface elements
            </h4>
            <div className="space-y-1">
              {elements.map((t) => (
                <ToggleRow
                  key={t.key}
                  toggle={t}
                  checked={display[t.key]}
                  onToggle={() => flip(t.key)}
                />
              ))}
            </div>
          </section>

          <p className="mt-3 text-right text-[11px] text-ink-500">
            {saving ? "Saving..." : "Saved"}
          </p>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  toggle,
  checked,
  onToggle,
  dimmed = false,
  note,
  label,
  hint
}: {
  toggle: DisplayToggle;
  checked: boolean;
  onToggle: () => void;
  dimmed?: boolean;
  note?: string;
  label?: string;
  hint?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={onToggle} />
      <span className="min-w-0">
        <span className="block text-sm text-ink-900">{label ?? toggle.label}</span>
        <span className="block text-xs text-ink-500">{note ?? hint ?? toggle.hint}</span>
      </span>
    </label>
  );
}
