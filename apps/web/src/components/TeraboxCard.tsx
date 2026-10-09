"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TERABOX_SIGNUP_URL, TOKEN_HELP } from "@/lib/terabox";

type Account = {
  id: string;
  provider: string;
  label: string;
  status: string;
  method: string;
  tokenHint: string | null;
};

// Shown at the top of the drive: link a Terabox account, then pull share links in.
export default function TeraboxCard() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [device, setDevice] = useState<{ qrcode_url?: string; device_code?: string; expires_in?: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/linked-accounts");
      if (!res.ok) return;
      const data = await res.json();
      const tb = (data.accounts ?? []).find((a: Account) => a.provider === "TERABOX") ?? null;
      setAccount(tb);
      setOauthAvailable(Boolean(data.terabox?.oauthAvailable));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function link(withToken: boolean) {
    setBusy("link");
    setError(null);
    try {
      const res = await fetch("/api/linked-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "TERABOX", label, token: withToken ? token : undefined })
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Could not link that account.");
        return;
      }
      setToken("");
      setNotice("Terabox linked.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    if (!account) return;
    if (!confirm("Disconnect Terabox? The stored credential is deleted.")) return;
    setBusy("unlink");
    try {
      await fetch(`/api/linked-accounts/${account.id}`, { method: "DELETE" });
      setAccount(null);
      setNotice("Terabox disconnected.");
    } finally {
      setBusy(null);
    }
  }

  async function startDeviceFlow() {
    setBusy("device");
    setError(null);
    try {
      const res = await fetch("/api/terabox/device-code", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start the Terabox sign-in.");
        return;
      }
      setDevice(data.device ?? null);
    } finally {
      setBusy(null);
    }
  }

  async function importLink() {
    setBusy("import");
    setError(null);
    try {
      const res = await fetch("/api/drive/import-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: shareUrl })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not import that link.");
        return;
      }
      setShareUrl("");
      setNotice("Added to your drive.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) return null;

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Terabox</h2>
        {account ? (
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
            linked{account.label ? ` as ${account.label}` : ""}
          </span>
        ) : (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-ink-500">not linked</span>
        )}
      </div>

      {!account ? (
        <>
          <p className="mt-1 text-sm text-ink-500">
            Link your Terabox account to keep its share links in your drive.
          </p>

          <ol className="mt-3 space-y-2 text-sm">
            <li>
              <span className="font-medium">1. Create a Terabox account</span> (free, up to 1 TB).
              <a href={TERABOX_SIGNUP_URL} target="_blank" rel="noreferrer" className="ml-2 text-brand-700 underline">
                Open terabox.com
              </a>
            </li>
            <li>
              <span className="font-medium">2. Connect it here.</span>
              {oauthAvailable ? (
                <button
                  onClick={startDeviceFlow}
                  disabled={busy !== null}
                  className="ml-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy === "device" ? "Starting..." : "Connect with Terabox"}
                </button>
              ) : (
                <span className="ml-2 text-xs text-ink-500">
                  Official sign-in is not enabled on this server.
                </span>
              )}
            </li>
          </ol>

          {device ? (
            <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium">Scan this in the Terabox app</p>
              {device.qrcode_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Terabox sign-in QR" src={device.qrcode_url} className="mt-2 h-40 w-40" />
              ) : null}
              {device.device_code ? <p className="mt-1 break-all font-mono text-xs">{device.device_code}</p> : null}
            </div>
          ) : null}

          <button onClick={() => setShowAdvanced((s) => !s)} className="mt-3 text-xs text-ink-500 underline">
            {showAdvanced ? "Hide" : "Advanced: use a session token instead"}
          </button>

          {showAdvanced ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">
                <span className="font-semibold">Unofficial.</span> Terabox has no open sign-in for ordinary users, so
                this path uses a session token copied from your browser. It may stop working at any time and may not be
                allowed by Terabox&apos;s terms. We store it encrypted and never ask for your password.
              </p>
              <p className="mt-1 text-xs text-amber-900">{TOKEN_HELP}</p>
              <input
                className="mt-2 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm"
                placeholder="Account name (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <input
                className="mt-2 w-full rounded-lg border border-amber-300 px-3 py-2 font-mono text-xs"
                placeholder="ndus session token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button
                onClick={() => link(true)}
                disabled={busy !== null || token.trim().length < 16}
                className="mt-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === "link" ? "Linking..." : "Link with session token"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-500">
            Linked via {account.method === "OAUTH" ? "Terabox sign-in" : "session token"}
            {account.tokenHint ? ` (${account.tokenHint})` : ""}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Paste a Terabox share link"
              value={shareUrl}
              onChange={(e) => setShareUrl(e.target.value)}
            />
            <button
              onClick={importLink}
              disabled={busy !== null || shareUrl.trim().length < 6}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy === "import" ? "Adding..." : "Add to my drive"}
            </button>
            <button onClick={unlink} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-red-600">
              Disconnect
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            Importing saves a pointer to the file, not a copy - the bytes stay on Terabox.
          </p>
        </>
      )}

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-brand-700">{notice}</p> : null}
    </div>
  );
}
