"use client";
import { useState } from "react";

type S = {
  theme: string; accent: string; dailyBackground: boolean; backgroundMode: string;
  customBackground: string; chatBackground: string;
  videoQuality: string; audioQuality: string; uploadQuality: string; autoplay: boolean;
  playbackSpeed: number; captionsDefault: boolean; pipEnabled: boolean; backgroundPlay: boolean; sponsorSkip: boolean;
  defaultVisibility: string; allowDownloads: boolean;
  recommendedContent: boolean; interests: string[]; nonInterests: string[];
  threadedComments: boolean; commentSort: string;
  whoCanComment: string; whoCanShare: string; whoCanReshare: string;
  profileVisible: boolean; whoCanViewPosts: string;
  autoSaveDrafts: boolean; historyEnabled: boolean; autoDeleteDays: number;
  hideSensitive: boolean; blockedWords: string[];
};

const SEL = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const INP = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 mt-1 text-xs text-ink-500">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      {children}
    </label>
  );
}

const opts = (arr: string[]) => arr.map((o) => <option key={o} value={o}>{o}</option>);

export default function SettingsPanel({ initial }: { initial: S }) {
  const [s, setS] = useState<S>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const set = <K extends keyof S>(k: K, v: S[K]) => setS((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s)
    });
    setBusy(false);
    setStatus(res.ok ? "Saved." : "Could not save.");
  }

  async function clearHistory() {
    setStatus("Clearing history...");
    const res = await fetch("/api/history", { method: "DELETE" });
    setStatus(res.ok ? "History cleared." : "Could not clear history.");
  }

  return (
    <div className="space-y-6">
      <Section title="Appearance &amp; background" hint="Theme, and the background used across the app and in DMs.">
        <Row label="Theme">
          <select className={SEL} value={s.theme} onChange={(e) => set("theme", e.target.value)}>{opts(["system", "light", "dark"])}</select>
        </Row>
        <Row label="Accent colour">
          <select className={SEL} value={s.accent} onChange={(e) => set("accent", e.target.value)}>{opts(["orange", "indigo", "emerald", "rose", "slate"])}</select>
        </Row>
        <Row label="Background mode">
          <select className={SEL} value={s.backgroundMode} onChange={(e) => set("backgroundMode", e.target.value)}>{opts(["static", "weekly", "daily", "custom"])}</select>
        </Row>
        <Toggle label="Change background daily" hint="Rotates through a colour set each day." value={s.dailyBackground} onChange={(v) => set("dailyBackground", v)} />
        <Row label="Custom background (DIY: colour or gradient)">
          <input className={INP} placeholder="#0f172a or linear-gradient(...)" value={s.customBackground} onChange={(e) => set("customBackground", e.target.value)} />
        </Row>
        <Row label="DM wallpaper (chat background)">
          <input className={INP} placeholder="#fff7ed or a gradient" value={s.chatBackground} onChange={(e) => set("chatBackground", e.target.value)} />
        </Row>
      </Section>

      <Section title="Quality &amp; playback" hint="Video and audio quality, playback behaviour.">
        <Row label="Video quality">
          <select className={SEL} value={s.videoQuality} onChange={(e) => set("videoQuality", e.target.value)}>{opts(["auto", "1080", "720", "480", "360"])}</select>
        </Row>
        <Row label="Audio quality">
          <select className={SEL} value={s.audioQuality} onChange={(e) => set("audioQuality", e.target.value)}>{opts(["auto", "high", "medium", "low"])}</select>
        </Row>
        <Row label="Upload quality">
          <select className={SEL} value={s.uploadQuality} onChange={(e) => set("uploadQuality", e.target.value)}>{opts(["original", "high", "medium", "low"])}</select>
        </Row>
        <Row label="Default playback speed">
          <input type="number" step="0.25" min="0.25" max="3" className={INP} value={s.playbackSpeed} onChange={(e) => set("playbackSpeed", Number(e.target.value))} />
        </Row>
        <Toggle label="Autoplay" value={s.autoplay} onChange={(v) => set("autoplay", v)} />
        <Toggle label="Captions on by default" value={s.captionsDefault} onChange={(v) => set("captionsDefault", v)} />
        <Toggle label="Picture-in-picture" hint="Keep playing in a floating mini player." value={s.pipEnabled} onChange={(v) => set("pipEnabled", v)} />
        <Toggle label="Background play" hint="Audio only, video hidden." value={s.backgroundPlay} onChange={(v) => set("backgroundPlay", v)} />
        <Toggle label="Skip points" hint="Auto-skip intros and sponsor segments." value={s.sponsorSkip} onChange={(v) => set("sponsorSkip", v)} />
      </Section>

      <Section title="Posts &amp; media" hint="Defaults applied when you post.">
        <Row label="Default post visibility">
          <select className={SEL} value={s.defaultVisibility} onChange={(e) => set("defaultVisibility", e.target.value)}>{opts(["PUBLIC", "FOLLOWERS", "PRIVATE"])}</select>
        </Row>
        <Toggle label="Allow others to download my media" value={s.allowDownloads} onChange={(v) => set("allowDownloads", v)} />
      </Section>

      <Section title="Recommended content" hint="What the For you feed shows you.">
        <Toggle label="Show recommended content" value={s.recommendedContent} onChange={(v) => set("recommendedContent", v)} />
        <Row label="Interests (comma separated)">
          <input className={INP} value={s.interests.join(", ")} onChange={(e) => set("interests", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
        </Row>
        <Row label="Not interested in (comma separated)">
          <input className={INP} value={s.nonInterests.join(", ")} onChange={(e) => set("nonInterests", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
        </Row>
        <p className="text-xs text-ink-500">Feed reset happens when you clear your history or interests.</p>
      </Section>

      <Section title="Comments" hint="How comment threads are shown.">
        <Toggle label="Branch view (threaded comments)" hint="Replies nest under their parent, like Reddit." value={s.threadedComments} onChange={(v) => set("threadedComments", v)} />
        <Row label="Sort comments by">
          <select className={SEL} value={s.commentSort} onChange={(e) => set("commentSort", e.target.value)}>{opts(["top", "new", "old"])}</select>
        </Row>
      </Section>

      <Section title="Sharing &amp; visibility" hint="Who can interact with your posts, and whether your profile is listed.">
        <Row label="Who can comment">
          <select className={SEL} value={s.whoCanComment} onChange={(e) => set("whoCanComment", e.target.value)}>{opts(["EVERYONE", "FOLLOWERS", "NOBODY"])}</select>
        </Row>
        <Row label="Who can share">
          <select className={SEL} value={s.whoCanShare} onChange={(e) => set("whoCanShare", e.target.value)}>{opts(["EVERYONE", "FOLLOWERS", "NOBODY"])}</select>
        </Row>
        <Row label="Who can reshare">
          <select className={SEL} value={s.whoCanReshare} onChange={(e) => set("whoCanReshare", e.target.value)}>{opts(["EVERYONE", "FOLLOWERS", "NOBODY"])}</select>
        </Row>
        <Row label="Who can view my posts">
          <select className={SEL} value={s.whoCanViewPosts} onChange={(e) => set("whoCanViewPosts", e.target.value)}>{opts(["PUBLIC", "FOLLOWERS", "PRIVATE"])}</select>
        </Row>
        <Toggle label="Show my profile" hint="Off = your profile is not visible to others." value={s.profileVisible} onChange={(v) => set("profileVisible", v)} />
      </Section>

      <Section title="Bookmarks &amp; saving">
        <Toggle label="Auto-save drafts" value={s.autoSaveDrafts} onChange={(v) => set("autoSaveDrafts", v)} />
        <p className="text-xs text-ink-500">Saved posts live on the Saved page.</p>
      </Section>

      <Section title="History" hint="What we keep, and for how long.">
        <Toggle label="Save watch history" value={s.historyEnabled} onChange={(v) => set("historyEnabled", v)} />
        <Row label="Auto-delete history after (days, 0 = never)">
          <input type="number" min="0" className={INP} value={s.autoDeleteDays} onChange={(e) => set("autoDeleteDays", Number(e.target.value))} />
        </Row>
        <button onClick={clearHistory} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
          Clear history now
        </button>
      </Section>

      <Section title="Moderation" hint="Filter what you see, and block words.">
        <Toggle label="Hide sensitive content" value={s.hideSensitive} onChange={(v) => set("hideSensitive", v)} />
        <Row label="Blocked words (comma separated)">
          <input className={INP} value={s.blockedWords.join(", ")} onChange={(e) => set("blockedWords", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />
        </Row>
      </Section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Saving..." : "Save all settings"}
        </button>
        {status && <span className="text-sm text-ink-500">{status}</span>}
      </div>
    </div>
  );
}
