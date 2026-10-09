"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";

type Initial = {
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
};

export default function ProfileSettings({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? "");
  const [coverUrl, setCoverUrl] = useState(initial.coverUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  async function upload(file: File): Promise<string | null> {
    const contentType = file.type || "application/octet-stream";
    const pres = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType, kind: "IMAGE" })
    });
    if (!pres.ok) return null;
    const { key, url } = await pres.json();
    const put = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!put.ok) return null;
    return key as string;
  }

  async function onPick(file: File | undefined, which: "avatar" | "cover") {
    if (!file) return;
    setBusy(true);
    setStatus("Uploading...");
    const key = await upload(file);
    setBusy(false);
    if (!key) {
      setStatus("Upload failed");
      return;
    }
    setStatus("Uploaded - remember to save.");
    if (which === "avatar") setAvatarUrl(key);
    else setCoverUrl(key);
  }

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, bio, avatarUrl, coverUrl })
    });
    setBusy(false);
    setStatus(res.ok ? "Saved." : "Could not save.");
    if (res.ok) router.refresh();
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Profile</h2>

        <div className="mb-4 flex items-center gap-3">
          <Avatar src={avatarUrl || undefined} name={displayName} size={64} />
          <div>
            <button
              onClick={() => avatarInput.current?.click()}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200"
            >
              Change photo
            </button>
            <input ref={avatarInput} type="file" accept="image/*" hidden
                   onChange={(e) => onPick(e.target.files?.[0], "avatar")} />
          </div>
        </div>

        <label className="block text-sm">
          Display name
          <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm">
          Bio
          <textarea className={field} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </label>

        <div className="mt-3">
          <div className="mb-2 h-24 overflow-hidden rounded-lg bg-gradient-to-r from-brand-100 to-brand-50">
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <button
            onClick={() => coverInput.current?.click()}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200"
          >
            Change cover
          </button>
          <input ref={coverInput} type="file" accept="image/*" hidden
                 onChange={(e) => onPick(e.target.files?.[0], "cover")} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save"}
          </button>
          {status && <span className="text-sm text-ink-500">{status}</span>}
        </div>
        <p className="mt-2 text-xs text-ink-500">Username (@{initial.username}) cannot be changed yet.</p>
      </section>
    </div>
  );
}
