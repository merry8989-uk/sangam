import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DriveBrowser from "@/components/DriveBrowser";

export const dynamic = "force-dynamic";

export default async function DrivePage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/settings");

  const items = await prisma.driveItem.findMany({
    where: { ownerId: userId, trashedAt: null, parentId: null },
    orderBy: [{ kind: "asc" }, { updatedAt: "desc" }]
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">My Drive</h1>
      <p className="mb-4 text-sm text-ink-500">
        Notes, sheets, documents, slides and any file you upload - all in one place.
      </p>
      <DriveBrowser
        items={items.map((i) => ({ ...i, updatedAt: i.updatedAt.toISOString(), trashedAt: i.trashedAt ? i.trashedAt.toISOString() : null }))}
        parentId={null}
        crumbs={[]}
      />
    </main>
  );
}
