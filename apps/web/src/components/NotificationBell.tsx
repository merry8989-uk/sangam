"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/notifications?count=1");
        if (res.ok) {
          const d = await res.json();
          if (active) setUnread(d.unread ?? 0);
        }
      } catch {
        /* ignore */
      }
    }
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      className="relative rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-slate-100"
    >
      Alerts
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
