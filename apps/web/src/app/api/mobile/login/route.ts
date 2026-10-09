import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueMobileToken } from "@/lib/mobileAuth";

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

// Sign in from the Android app and receive a Bearer token.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user?.passwordHash) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  return NextResponse.json({
    token: issueMobileToken(user.id),
    user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl }
  });
}
