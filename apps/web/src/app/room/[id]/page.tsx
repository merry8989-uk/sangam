import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RoomClient from "@/components/RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { code?: string };
}) {
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: { owner: { select: { username: true, displayName: true } } }
  });
  if (!room) notFound();

  const isOwner = viewerId === room.ownerId;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{room.name}</h1>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">{room.kind}</span>
        {room.isLive && <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-600">LIVE</span>}
        {room.status !== "ACTIVE" && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">ended</span>}
      </div>

      <p className="mb-4 text-xs text-ink-500">
        Hosted by <Link className="underline" href={`/channel/${room.owner.username}`}>@{room.owner.username}</Link>
        {isOwner ? " - share the code below so people can join." : ""}
      </p>

      {isOwner ? (
        <p className="mb-4 text-sm">
          Join code: <span className="font-mono text-base font-semibold">{room.joinCode}</span>
        </p>
      ) : null}

      {room.kind === "LIVE" && isOwner && room.rtmpUrl ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Go live from OBS, a laptop or a phone</h2>
          <p className="mt-1 text-xs text-ink-500">
            Paste this into OBS, Streamlabs, or any RTMP broadcaster app on your phone.
          </p>
          <p className="mt-2 break-all font-mono text-xs">{room.rtmpUrl}</p>
        </div>
      ) : null}

      {room.status === "ACTIVE" ? (
        <RoomClient roomId={room.id} joinCode={searchParams.code} kind={room.kind} />
      ) : (
        <p className="text-sm text-ink-500">This room has ended.</p>
      )}
    </main>
  );
}
