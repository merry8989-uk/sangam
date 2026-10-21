"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DIAG_FORMATS,
  DIAGNOSTICS_EXCLUDES,
  DIAGNOSTICS_INCLUDES,
  buildGmailCompose,
  buildMailto,
  buildReport,
  formatHint,
  formatLabel,
  formatReport,
  mimeType,
  reportFilename,
  summaryLines,
  type DiagEntry,
  type DiagFormat,
  type DiagServerInfo,
  type DiagnosticReport
} from "@/lib/diagnostics";
import {
  canShareFiles,
  clearEntries,
  clientInfo,
  getEntries,
  getSessionId,
  shareReportFile,
  subscribe
} from "@/lib/diagnosticsClient";

/**
 * The Diagnostics screen.
 *
 * The whole point is that the user does not have to describe the problem. The
 * report is assembled for them, and sending it is one press: the file is saved,
 * a copy is submitted, and their mail client opens with the subject and body
 * already written.
 */
export default function DiagnosticsPanel({
  appVersion,
  supportEmail,
  enabled
}: {
  appVersion: string;
  /** From DIAGNOSTICS_SUPPORT_EMAIL. Empty when the deployment set none. */
  supportEmail: string;
  enabled: boolean;
}) {
  const [entries, setEntries] = useState<DiagEntry[]>([]);
  const [server, setServer] = useState<DiagServerInfo | null>(null);
  const [format, setFormat] = useState<DiagFormat>("md");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailReady, setEmailReady] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(getEntries());
    try {
      const res = await fetch("/api/diagnostics");
      const data = await res.json();
      setServer(data.server ?? null);
      setEmailReady(Boolean(data.emailReady));
    } catch {
      setServer(null);
    }
  }, []);

  useEffect(() => {
    setCanShare(canShareFiles());
    void refresh();
    return subscribe(() => setEntries(getEntries()));
  }, [refresh]);

  const report: DiagnosticReport = useMemo(
    () =>
      buildReport({
        platform: "web",
        appVersion,
        signedIn: Boolean(server),
        client: clientInfo(appVersion),
        server,
        sessionId: getSessionId(),
        entries
      }),
    [appVersion, server, entries]
  );

  const filename = reportFilename(report, format);

  function download() {
    const text = formatReport(report, format);
    const blob = new Blob([text], { type: mimeType(format) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function submit(): Promise<boolean> {
    const res = await fetch("/api/diagnostics/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note,
        platform: "web",
        appVersion,
        format,
        entries,
        client: clientInfo(appVersion)
      })
    });
    return res.ok;
  }

  async function copy() {
    setBusy("copy");
    setStatus(null);
    try {
      await navigator.clipboard.writeText(formatReport(report, "md"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setStatus("Could not copy. Use Download instead.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * The only path that arrives with a real attachment and no user step: the
   * server sends the mail. A mailto link and a Gmail compose URL cannot carry a
   * file, so this is what "attached" actually means.
   */
  async function sendViaServer() {
    setBusy("email");
    setStatus(null);
    try {
      const res = await fetch("/api/diagnostics/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          platform: "web",
          appVersion,
          format,
          sessionId: getSessionId(),
          entries,
          client: clientInfo(appVersion)
        })
      });
      const data = await res.json().catch(() => ({}));
      setStatus(
        res.ok
          ? `Sent to support, with ${filename} attached. Nothing else to do.`
          : `Could not send: ${data.error ?? "the mail provider refused it"}. Try the other options below.`
      );
    } catch {
      setStatus("Could not reach the server. Try Download instead.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Hand the file to the system share sheet. On a phone the user picks Gmail
   * and the file is already attached - no server needed.
   */
  async function shareToGmail() {
    setBusy("share");
    setStatus(null);
    try {
      const text = formatReport(report, format);
      const ok = await shareReportFile(text, filename, mimeType(format));
      if (ok) {
        setStatus("Choose Gmail in the share sheet - the report is already attached.");
      } else {
        setStatus("Sharing was cancelled, or this device cannot share files. Try another option.");
      }
    } catch {
      setStatus("Sharing did not work on this device.");
    } finally {
      setBusy(null);
    }
  }

  /** Desktop fallback: Gmail compose, prefilled, plus the file to attach. */
  function openGmail() {
    download();
    const link = buildGmailCompose({
      to: supportEmail,
      subject: `Sangam diagnostics ${report.id} - ${report.appVersion} - ${report.platform}`,
      body: summaryLines(report).join("\n") + `\n\nAttach the file that was just downloaded:\n  ${filename}\n`
    });
    window.open(link, "_blank", "noopener");
    setStatus(`Gmail is open. Attach the file that was just saved as ${filename}.`);
  }

  /** Save the file, submit a copy, then open the mail client already filled in. */
  async function send() {
    setBusy("send");
    setStatus(null);
    try {
      download();
      const ok = await submit();
      const link = buildMailto({ to: supportEmail, report, format, filename, note });
      window.location.href = link;
      setStatus(
        ok
          ? `Report saved as ${filename} and sent to support. Your mail app has opened - attach the file and press send.`
          : `Report saved as ${filename}. Your mail app has opened - attach the file and press send. (The automatic copy could not be stored.)`
      );
    } catch {
      setStatus("Something went wrong preparing the report. Try Download instead.");
    } finally {
      setBusy(null);
    }
  }

  async function submitOnly() {
    setBusy("submit");
    setStatus(null);
    try {
      const ok = await submit();
      setStatus(ok ? "Report sent to support. Nothing else is needed." : "Could not send the report.");
    } catch {
      setStatus("Could not send the report.");
    } finally {
      setBusy(null);
    }
  }

  function clear() {
    if (!window.confirm("Delete the recorded events on this device? This cannot be undone.")) return;
    clearEntries();
    setEntries([]);
    setStatus("Recorded events cleared from this device.");
  }

  if (!enabled) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-ink-900">Diagnostics are turned off.</p>
        <p className="mt-1 text-xs text-ink-500">
          Nothing is being recorded on this device, so there is nothing to send. You can turn it back
          on in Settings.
        </p>
      </div>
    );
  }

  const worst = entries.filter((e) => e.severity === "error").length;

  return (
    <div className="space-y-6">
      {status && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{status}</p>}

      {/* ---- what will be sent ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">What will be sent</h2>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <Row label="Report id" value={report.id} />
          <Row label="App" value={`${report.appVersion} (${report.platform})`} />
          <Row label="Events recorded" value={`${entries.length}`} />
          <Row label="Errors" value={`${worst}`} />
          {report.client && <Row label="Route" value={report.client.route} />}
          {report.client && <Row label="Browser" value={report.client.userAgent.slice(0, 60) + "…"} />}
          {report.server && <Row label="Node" value={report.server.nodeVersion} />}
          {report.server && (
            <Row
              label="Server checks"
              value={report.server.checks.map((c) => `${c.name}: ${c.ok ? "ok" : "failed"}`).join(", ")}
            />
          )}
        </dl>
      </section>

      {/* ---- what is in it, and what is not ---- */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Included</h3>
          <ul className="space-y-1">
            {DIAGNOSTICS_INCLUDES.map((t) => (
              <li key={t} className="text-xs text-ink-700">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Never included
          </h3>
          <ul className="space-y-1">
            {DIAGNOSTICS_EXCLUDES.map((t) => (
              <li key={t} className="text-xs text-ink-700">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- the format ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Format</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {DIAG_FORMATS.map((f) => (
            <label
              key={f}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${
                format === f ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="diagFormat"
                className="mt-0.5"
                checked={format === f}
                onChange={() => setFormat(f)}
              />
              <span>
                <span className="block text-xs font-medium text-ink-900">{formatLabel(f)}</span>
                <span className="block text-xs text-ink-500">{formatHint(f)}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">
          The file will be named <code className="font-mono">{filename}</code>
        </p>
      </section>

      {/* ---- the note ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label htmlFor="diag-note" className="mb-2 block text-sm font-semibold text-ink-900">
          What went wrong? <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <textarea
          id="diag-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="One line is enough. The report already has the technical detail."
          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
        />
      </section>

      {/* ---- actions ---- */}
      <section className="flex flex-wrap gap-2">
        {supportEmail && emailReady && (
          <button
            onClick={sendViaServer}
            disabled={busy !== null}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy === "email" ? "Sending..." : "Email it with the report attached"}
          </button>
        )}
        {canShare && (
          <button
            onClick={shareToGmail}
            disabled={busy !== null}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {busy === "share" ? "Sharing..." : "Share to Gmail"}
          </button>
        )}
        {supportEmail && !emailReady && (
          <button
            onClick={openGmail}
            disabled={busy !== null}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Open in Gmail
          </button>
        )}
        {supportEmail && (
          <button
            onClick={send}
            disabled={busy !== null}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {busy === "send" ? "Preparing..." : "Send from my mail app"}
          </button>
        )}
        <button
          onClick={submitOnly}
          disabled={busy !== null}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
        >
          {busy === "submit" ? "Sending..." : "Send without email"}
        </button>
        <button
          onClick={download}
          disabled={busy !== null}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
        >
          Download file
        </button>
        <button
          onClick={copy}
          disabled={busy !== null}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
        <button
          onClick={refresh}
          disabled={busy !== null}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          onClick={clear}
          disabled={busy !== null}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Clear
        </button>
      </section>

      {!supportEmail && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No support address is configured on this server, so the email options are hidden. Use
          Download or Send without email instead. Set{" "}
          <code className="font-mono">DIAGNOSTICS_SUPPORT_EMAIL</code> to turn them on.
        </p>
      )}
      {supportEmail && !emailReady && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-700">
          A mail provider is not configured on this server, so the report cannot be sent with the
          attachment automatically. <b>Open in Gmail</b> fills in the message and saves the file - you
          then attach it. To send it attached with no step, set{" "}
          <code className="font-mono">EMAIL_PROVIDER</code>,{" "}
          <code className="font-mono">EMAIL_API_KEY</code> and{" "}
          <code className="font-mono">EMAIL_FROM</code>.
        </p>
      )}

      {/* ---- the raw log ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">
          Recorded events <span className="font-normal text-ink-500">({entries.length})</span>
        </h2>
        {entries.length === 0 ? (
          <p className="text-xs text-ink-500">
            Nothing recorded yet. That is normal if nothing has gone wrong - and it is itself useful
            to send.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {entries
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={i} className="rounded border border-slate-100 px-2 py-1 text-xs">
                  <span
                    className={`mr-2 font-medium ${
                      e.severity === "error" ? "text-red-600" : e.severity === "warn" ? "text-amber-700" : "text-ink-500"
                    }`}
                  >
                    {e.severity}
                  </span>
                  <span className="mr-2 text-ink-500">{e.kind}</span>
                  <span className="text-ink-900">{e.message}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* ---- a plain preview of the email body ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Email preview</h2>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-ink-700">
          {summaryLines(report).join("\n")}
        </pre>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-ink-900">{value}</dd>
    </div>
  );
}
