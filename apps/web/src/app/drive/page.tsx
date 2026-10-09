import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DriveBrowser from "@/components/DriveBrowser";
import { listSharedWithMe } from "@/lib/driveAccess";
import TeraboxCard from "@/components/TeraboxCard";
import ZohoCard from "@/components/ZohoCard";

export const dynamic = "force-dynamic";

export default async function DrivePage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/settings");

  const [items, shared] = await Promise.all([
    prisma.driveItem.findMany({
      where: { ownerId: userId, trashedAt: null, parentId: null },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }]
    }),
    listSharedWithMe(userId)
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">My Drive</h1>
      <p className="mb-4 text-sm text-ink-500">
        Notes, sheets, documents, slides and any file you upload - all in one place.
      </p>
      <ZohoCard />
      <TeraboxCard />
      <DriveBrowser
        items={items.map((i) => ({ ...i, updatedAt: i.updatedAt.toISOString(), trashedAt: i.trashedAt ? i.trashedAt.toISOString() : null, sourceUrl: i.sourceUrl }))}
        parentId={null}
        crumbs={[]}
      />

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">Shared with me</h2>
        {shared.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing has been shared with you yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shared.map((s) => (
              <a
                key={s.shareId}
                href={`/drive/${s.item.id}`}
                className="rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-600"
              >
                <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-brand-700">
                  {s.role === "EDITOR" ? "can edit" : "can view"}
                </span>
                <p className="mt-2 truncate font-medium">{s.item.name}</p>
                <p className="text-xs text-ink-500">{s.item.kind.toLowerCase()}</p>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
