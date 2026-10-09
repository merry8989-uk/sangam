import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

const Body = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(300).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC")
});

// Create a group. The creator becomes OWNER and first member.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, description, visibility } = parsed.data;

  // unique slug
  const base = slugify(name) || "group";
  let slug = base;
  for (let i = 2; await prisma.group.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }

  const group = await prisma.group.create({
    data: {
      slug,
      name,
      description,
      visibility,
      ownerId: userId,
      members: { create: { userId, role: "OWNER" } }
    }
  });
  return NextResponse.json({ slug: group.slug }, { status: 201 });
}
