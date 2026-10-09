import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { indexUsers } from "@/lib/search";

const Body = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_.]+$/i),
  displayName: z.string().min(1).max(60),
  password: z.string().min(8).max(128)
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, username, displayName, password } = parsed.data;

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true, username: true }
  });
  if (clash) {
    return NextResponse.json(
      { error: clash.email === email ? "Email already registered" : "Username taken" },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      passwordHash: await bcrypt.hash(password, 12)
    },
    select: { id: true, username: true }
  });
  await indexUsers([{ id: user.id, username: user.username, displayName }]);
  return NextResponse.json(user, { status: 201 });
}
