import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DriveBrowser from "@/components/DriveBrowser";
import DriveEditor from "@/components/DriveEditor";

export const dynamic = "force-dynamic";

async function crumbsFor(itemId: string, ownerId: string) {
  const trail: { id: string; name: string }[] = [];
  let cursor: string | null = itemId;
  for (let i = 0; i < 50 && cursor; i++) {
    const row: { id: string; name: string; parentId: string | null } | null = await prisma.driveItem.findFirst({
      where: { id: cursor, ownerId },
      select: { id: true, name: true, parentId: true }
    });
    if (!row) break;
    trail.unshift({ id: row.id, name: row.name });
    cursor = row.parentId;
  }
  return trail;
}

export default async function DriveItemPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/settings");

  const item = await prisma.driveItem.findFirst({ where: { id: params.id, ownerId: userId } });
  if (!item) notFound();

  if (item.kind === "FOLDER") {
    const [children, crumbs] = await Promise.all([
      prisma.driveItem.findMany({
        where: { ownerId: userId, trashedAt: null, parentId: item.id },
        orderBy: [{ kind: "asc" }, { updatedAt: "desc" }]
      }),
      crumbsFor(item.id, userId)
    ]);
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <DriveBrowser
          items={children.map((i) => ({ ...i, updatedAt: i.updatedAt.toISOString(), trashedAt: i.trashedAt ? i.trashedAt.toISOString() : null }))}
          parentId={item.id}
          crumbs={crumbs}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <DriveEditor
        item={{
          id: item.id,
          kind: item.kind,
          name: item.name,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          storageKey: item.storageKey,
          content: item.content
        }}
      />
    </main>
  );
}
