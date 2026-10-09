import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Moderation review queue. Admin-only in production - gate this route behind
// a MODERATOR/ADMIN role check before exposing it.
export default async function ModerationPage() {
  const [flags, reports] = await Promise.all([
    prisma.moderationFlag.findMany({ where: { resolved: false }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.report.findMany({ where: { resolved: false }, orderBy: { createdAt: "desc" }, take: 100 })
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold">Moderation queue</h1>
      <p className="mb-6 text-sm text-ink-500">
        {flags.length} unresolved flag{flags.length === 1 ? "" : "s"}
      </p>
      {reports.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">User reports</h2>
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <span className="font-medium">{r.entityType} · {r.entityId}</span>
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">{r.reason}</span>
                <div className="mt-1 text-xs text-ink-500">{new Date(r.createdAt).toLocaleString("en-IN")}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-2 font-semibold">AI flags</h2>
      <ul className="space-y-3">
        {flags.length === 0 && <li className="text-ink-500">Queue is clear.</li>}
        {flags.map((f) => (
          <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {f.entityType} · {f.entityId}
              </span>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                {f.reason}
              </span>
            </div>
            <div className="mt-1 text-sm text-ink-500">
              score {f.score?.toFixed(2) ?? "-"} · {f.source} · {new Date(f.createdAt).toLocaleString("en-IN")}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
