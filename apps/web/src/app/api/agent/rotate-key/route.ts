import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureAgent, newAgentKey } from "@/lib/agent";

// Rotate the API key external callers use. Invalidates the previous key.
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureAgent(userId);
  const agent = await prisma.agent.update({ where: { userId }, data: { apiKey: newAgentKey() } });
  return NextResponse.json({ apiKey: agent.apiKey });
}
