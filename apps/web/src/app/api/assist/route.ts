import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { callAi } from "@/lib/ai";

const Body = z.object({
  task: z.enum(["captions", "hashtags", "title", "alt_text", "translate"]),
  text: z.string().max(4000).default(""),
  tone: z.string().max(30).default("friendly"),
  target: z.string().max(12).default("hi-IN")
});

// Server-side proxy so the browser never needs the AI service URL.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const result = await callAi<{ result: unknown }>("/agents/assist", parsed.data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Assist service unavailable" }, { status: 502 });
  }
}
