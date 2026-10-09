"use client";
import { useState } from "react";
import Link from "next/link";

// Less-used destinations live behind one menu so the bar stays readable.
export default function NavMore({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-slate-100"
        aria-expanded={open}
      >
        More
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-slate-100"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
