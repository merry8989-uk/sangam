"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  analyticsEnabled,
  setAnalyticsConsent,
  endSession,
  setRoute,
  startSession,
  track,
  trackCrash,
  trackFriction
} from "@/lib/analytics";

/**
 * The web half of the event standard.
 *
 * Mounted once in the root layout. It does four things:
 *
 *   page_view      on every route change
 *   web_vitals     once per page load, from the browser's own PerformanceObserver
 *   js_error       on an unhandled error or a rejected promise
 *   friction_signal  three taps on one element in two seconds, a tap that does
 *                    nothing, three backs in two seconds
 *
 * Nothing here fires unless the user has agreed to analytics, and the check is
 * inside `track` rather than here, so a new call site cannot forget it.
 */
export default function AnalyticsCapture({
  releaseChannel,
  consent
}: {
  releaseChannel?: string;
  /** The user's setting. Off by default; see the note on UserSettings. */
  consent?: boolean;
}) {
  const pathname = usePathname();

  // The server setting is the source of truth; the local flag mirrors it so the
  // gate holds even before the session is known.
  useEffect(() => {
    setAnalyticsConsent(Boolean(consent));
  }, [consent]);

  // ---- the session, once ----
  useEffect(() => {
    if (!analyticsEnabled()) return;
    const started = performance.now();
    startSession(
      {
        platform: "web",
        os: navigator.userAgent.slice(0, 120),
        device_model: `${window.screen.width}x${window.screen.height}`,
        network_type: (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType
          ? "cellular"
          : "unknown",
        release_channel: (releaseChannel as "production" | "beta" | "development") ?? "development",
        screen_or_route: window.location.pathname
      },
      { cold: true, ms: Math.round(started) }
    );
    const onHide = () => endSession();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [releaseChannel]);

  // ---- a page view per route ----
  useEffect(() => {
    if (!pathname) return;
    setRoute(pathname);
    track("page_view", {
      url_path: pathname,
      ...(document.referrer ? { referrer: new URL(document.referrer).host } : {}),
      title: document.title.slice(0, 120)
    });
  }, [pathname]);

  // ---- web vitals ----
  useEffect(() => {
    if (!analyticsEnabled() || typeof PerformanceObserver === "undefined") return;
    const seen: Record<string, number> = {};
    let sent = false;

    const flushVitals = () => {
      if (sent || seen.lcp_ms === undefined) return;
      sent = true;
      track("web_vitals", {
        lcp_ms: Math.round(seen.lcp_ms),
        ...(seen.cls !== undefined ? { cls: Number(seen.cls.toFixed(4)) } : {}),
        ...(seen.inp_ms !== undefined ? { inp_ms: Math.round(seen.inp_ms) } : {}),
        ...(seen.ttfb_ms !== undefined ? { ttfb_ms: Math.round(seen.ttfb_ms) } : {})
      });
    };

    const observers: PerformanceObserver[] = [];
    const observe = (type: string, cb: (e: PerformanceEntry) => void) => {
      try {
        const o = new PerformanceObserver((list) => list.getEntries().forEach(cb));
        o.observe({ type, buffered: true } as PerformanceObserverInit);
        observers.push(o);
      } catch {
        // The browser does not support this entry type. Not an error.
      }
    };

    observe("largest-contentful-paint", (e) => {
      seen.lcp_ms = e.startTime;
    });
    observe("layout-shift", (e) => {
      const entry = e as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
      if (!entry.hadRecentInput) seen.cls = (seen.cls ?? 0) + (entry.value ?? 0);
    });
    observe("event", (e) => {
      const entry = e as PerformanceEntry & { interactionId?: number };
      if (entry.interactionId) seen.inp_ms = Math.max(seen.inp_ms ?? 0, e.duration);
    });
    observe("navigation", (e) => {
      seen.ttfb_ms = e.responseStart;
    });

    // Vitals settle after the page is quiet; the first hide or a short delay is
    // when they are worth sending.
    const onHide = () => flushVitals();
    window.addEventListener("pagehide", onHide);
    const t = setTimeout(flushVitals, 5000);

    return () => {
      clearTimeout(t);
      window.removeEventListener("pagehide", onHide);
      for (const o of observers) o.disconnect();
      flushVitals();
    };
  }, [pathname]);

  // ---- crashes and errors ----
  useEffect(() => {
    if (!analyticsEnabled()) return;
    const onError = (event: ErrorEvent) => {
      void trackCrash(event.error ?? event.message, { fatal: false, event: "js_error" });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void trackCrash(event.reason, { fatal: false, event: "js_error" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // ---- the friction signals ----
  useEffect(() => {
    if (!analyticsEnabled()) return;

    // Three taps on the same element inside two seconds. Something looked
    // tappable and was not - the single most useful signal on this list.
    const RAGE_WINDOW = 2000;
    const RAGE_COUNT = 3;
    let taps: number[] = [];
    let lastTarget = "";
    let backs: number[] = [];
    let lastActionAt = 0;

    const describe = (el: Element | null): string => {
      if (!el) return "unknown";
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" && el.className ? `.${el.className.split(/\s+/)[0]}` : "";
      const text = (el.textContent ?? "").trim().slice(0, 30);
      return `${tag}${id}${cls}${text ? ` "${text}"` : ""}`;
    };

    const onPointerUp = (e: PointerEvent) => {
      const now = Date.now();
      const target = describe(e.target as Element);
      if (target !== lastTarget) {
        taps = [];
        lastTarget = target;
      }
      taps = [...taps.filter((t) => now - t < RAGE_WINDOW), now];
      if (taps.length >= RAGE_COUNT) {
        trackFriction("rage_click", target, { count: taps.length, windowMs: RAGE_WINDOW });
        taps = [];
      }
      lastActionAt = now;
    };

    // A tap that changed nothing: no navigation and no visible mutation within
    // a short window. Best effort - a false positive here is one extra line.
    let pendingClick: { target: string; url: string; at: number } | null = null;
    const onClick = (e: MouseEvent) => {
      pendingClick = { target: describe(e.target as Element), url: location.href, at: Date.now() };
    };
    const deadCheck = setInterval(() => {
      if (!pendingClick) return;
      const stillHere = location.href === pendingClick.url;
      const quiet = Date.now() - lastActionAt > 900;
      if (stillHere && quiet && Date.now() - pendingClick.at > 900) {
        trackFriction("dead_click", pendingClick.target, { windowMs: 900 });
        pendingClick = null;
      } else if (!stillHere) {
        pendingClick = null;
      }
    }, 500);

    const onPopState = () => {
      const now = Date.now();
      backs = [...backs.filter((t) => now - t < RAGE_WINDOW), now];
      if (backs.length >= RAGE_COUNT) {
        trackFriction("back_button_spam", "history", { count: backs.length, windowMs: RAGE_WINDOW });
        backs = [];
      }
    };

    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      clearInterval(deadCheck);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return null;
}
