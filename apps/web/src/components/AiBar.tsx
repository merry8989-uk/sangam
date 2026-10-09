"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const options = [
  { href: "/ai", label: "New chat", hint: "Start a fresh conversation" },
  { href: "/ai#recent", label: "Recent chat", hint: "Pick up where you left off" },
  { href: "/ai/agent#skills", label: "Skills", hint: "What your agent can do" },
  { href: "/ai/agent#knowledge", label: "Knowledge base", hint: "Facts your agent knows" },
  { href: "/ai/agent#scheduled", label: "Scheduled task", hint: "Run prompts on a schedule" },
  { href: "/ai/agent#connectors", label: "Connector", hint: "Hook up external tools" }
];

// Docked side bar, like a browser sidebar:
//  - always present as a slim bar (not floating over content)
//  - tap the tab to expand the options; tap again to collapse
//  - collapses automatically on navigation
//  - shows a small dot on the tab while collapsed, so it is clear there is more
export default function AiBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 border-l border-slate-200 bg-white sm:flex"
      aria-label="AI"
    >
      {open && (
        <div className="w-64 overflow-y-auto border-r border-slate-200">
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
            AI options
          </div>
          <ul>
            {options.map((o) => (
              <li key={o.href}>
                <Link href={o.href} className="block px-4 py-2 hover:bg-slate-50">
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
        aria-label={open ? "Hide AI options" : "Show AI options"}
        className="relative flex w-14 shrink-0 flex-col items-center gap-1 pt-4"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
          AI
          {!open && (
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          )}
        </span>
        <span className="text-[10px] font-medium text-ink-500">{open ? "Hide" : "More"}</span>
      </button>
    </aside>
  );
}
