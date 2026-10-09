"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = {
  configured: boolean;
  dc: string;
  accountsBase: string;
  linked: boolean;
  account: { id: string; label: string; apiDomain: string } | null;
};

type WdFile = { id: string; name: string; extn?: string; permalink?: string };

// Link a Zoho WorkDrive account, then create documents, sheets and slides in
// it or push files across.
export default function ZohoCard() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [files, setFiles] = useState<WdFile[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/zoho/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(kind: "SHEET" | "DOC" | "SLIDES") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/drive/zoho/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create that in Zoho.");
        return;
      }
      setNotice(`Created "${data.item?.name}" in WorkDrive.`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy("UPLOAD");
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const form = new FormData();
        form.append("file", f);
        const res = await fetch("/api/drive/zoho/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? `Could not upload ${f.name}.`);
          continue;
        }
        setNotice(`Uploaded ${f.name} to WorkDrive.`);
      }
      router.refresh();
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function showFiles() {
    setBusy("LIST");
    setError(null);
    try {
      const res = await fetch("/api/drive/zoho/list");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not read WorkDrive.");
        return;
      }
      setFiles(data.files ?? []);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!status?.account) return;
    if (!confirm("Disconnect Zoho? The stored tokens are deleted.")) return;
    setBusy("UNLINK");
    try {
      await fetch(`/api/linked-accounts/${status.account.id}`, { method: "DELETE" });
      setFiles(null);
      setNotice("Zoho disconnected.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Zoho WorkDrive</h2>
        {status.linked ? (
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs text-brand-700">linked</span>
        ) : (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-ink-500">not linked</span>
        )}
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-ink-500">
          {status.dc === "in" ? "India data centre" : `data centre: ${status.dc}`}
        </span>
      </div>

      {!status.configured ? (
        <p className="mt-2 text-sm text-ink-500">
          Zoho is not set up on this server yet. Register a client at{" "}
          <a className="underline" href={`https://api-console.zoho.${status.dc}`} target="_blank" rel="noreferrer">
            api-console.zoho.{status.dc}
          </a>{" "}
          and set <span className="font-mono text-xs">ZOHO_CLIENT_ID</span> and{" "}
          <span className="font-mono text-xs">ZOHO_CLIENT_SECRET</span>.
        </p>
      ) : !status.linked ? (
        <>
          <p className="mt-2 text-sm text-ink-500">
            Connect Zoho WorkDrive to create documents, sheets and slides there, and to upload files into it.
          </p>
          <a
            href="/api/zoho/connect"
            className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Connect Zoho WorkDrive
          </a>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-500">
            Linked to {status.account?.label}. New files land in your Zoho My Folders.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => create("SHEET")} disabled={busy !== null} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === "SHEET" ? "Creating..." : "New sheet"}
            </button>
            <button onClick={() => create("DOC")} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
              {busy === "DOC" ? "Creating..." : "New document"}
            </button>
            <button onClick={() => create("SLIDES")} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
              {busy === "SLIDES" ? "Creating..." : "New slides"}
            </button>
            <button onClick={() => fileInput.current?.click()} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
              {busy === "UPLOAD" ? "Uploading..." : "Upload to WorkDrive"}
            </button>
            <button onClick={showFiles} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">
              {busy === "LIST" ? "Reading..." : "Show WorkDrive files"}
            </button>
            <button onClick={disconnect} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-red-600">
              Disconnect
            </button>
          </div>

          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />

          {files ? (
            <ul className="mt-3 space-y-1 text-sm">
              {files.length === 0 ? (
                <li className="text-ink-500">Your WorkDrive folder is empty.</li>
              ) : (
                files.map((f) => (
                  <li key={f.id}>
                    {f.permalink ? (
                      <a href={f.permalink} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                        {f.name}
                      </a>
                    ) : (
                      f.name
                    )}
                    {f.extn ? <span className="ml-2 text-xs text-ink-500">.{f.extn}</span> : null}
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-brand-700">{notice}</p> : null}
    </div>
  );
}
