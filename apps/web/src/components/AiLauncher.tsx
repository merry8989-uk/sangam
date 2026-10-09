"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const options = [
  { href: "/ai", label: "New chat", hint: "Start a fresh conversation" },
  { href: "/ai#recent", label: "Recent chat", hint: "Pick up where you left off" },
  { href: "/ai/agent#skills", label: "Skills", hint: "What your agent can do" },
  { href: "/ai/agent#knowledge", label: "Knowledge base", hint: "Facts your agent knows" },
  { href: "/ai/agent#scheduled", label: "Scheduled task", hint: "Run prompts on a schedule" },
  { href: "/ai/agent#connectors", label: "Connector", hint: "Hook up external tools" }
];

// Floating AI button. Tap to reveal the options; tap again to hide.
// When collapsed it shows a small dot so people know there is more inside.
export default function AiLauncher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (pathname?.startsWith("/ai")) return null; // avoid overlapping the chat page

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            AI options
          </div>
          <ul>
            {options.map((o) => (
              <li key={o.href}>
                <Link
                  href={o.href}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 hover:bg-slate-50"
                >
                  <div className="text-sm font-medium text-ink-900">{o.label}</div>
                  <div className="text-xs text-ink-500">{o.hint}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="AI options"
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700"
      >
        <span className="text-lg font-bold">AI</span>
        {/* small sign that more options exist, when collapsed */}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
        )}
      </button>
    </div>
  );
}
