import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DirectMessageThread from "@/components/DirectMessageThread";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const mine = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: params.id, userId } }
  });
  if (!mine) notFound();

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      participants: {
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 }
    }
  });
  if (!conversation) notFound();

  const other = conversation.participants.find((p) => p.userId !== userId)?.user ?? null;

  // Opening the thread marks it read.
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: params.id, userId } },
    data: { lastReadAt: new Date() }
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <DirectMessageThread
        conversationId={params.id}
        meId={userId}
        other={other}
        initial={conversation.messages}
      />
    </main>
  );
}
