import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RoomLauncher from "@/components/RoomLauncher";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;

  const liveNow = await prisma.room.findMany({
    where: { kind: "LIVE", status: "ACTIVE", visibility: "PUBLIC" },
    orderBy: { startedAt: "desc" },
    take: 24,
    include: { owner: { select: { username: true, displayName: true } } }
  });

  const mine = viewerId
    ? await prisma.room.findMany({
        where: { ownerId: viewerId, status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        take: 12
      })
    : [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-semibold">Live</h1>
      <p className="mb-4 mt-1 text-sm text-ink-500">
        Go live from your phone or laptop, start a call or a meeting. All three run on the same server.
      </p>

      <RoomLauncher />

      {mine.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Your active rooms</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {mine.map((r) => (
              <Link key={r.id} href={`/room/${r.id}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm hover:border-brand-600">
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-ink-500">{r.kind} - code {r.joinCode}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Live now</h2>
        {liveNow.length === 0 ? (
          <p className="text-sm text-ink-500">Nobody is live right now.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {liveNow.map((r) => (
              <Link key={r.id} href={`/room/${r.id}`} className="rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-600">
                <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-600">LIVE</span>
                <p className="mt-2 font-medium">{r.name}</p>
                <p className="text-xs text-ink-500">@{r.owner.username}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
