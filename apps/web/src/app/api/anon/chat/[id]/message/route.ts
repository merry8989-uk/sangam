import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";
import { logActivity } from "@/lib/loggerServer";
import { loadChat } from "@/lib/anonAccess";
import { attachmentKind, validateMessage, MAX_ATTACHMENT_BYTES } from "@/lib/anon";
import { keyBelongsToUser } from "@/lib/s3";

/**
 * Send a message.
 *
 * There is no PATCH and no PUT on this path, and there will not be: a message is
 * written once and never changed. `canEditMessage()` in lib/anon.ts returns false
 * and is asserted by the tests, so the rule has a second lock beside the missing
 * route.
 *
 * Attachments are any file type. The client presigns through /api/upload, uploads
 * directly to storage, then names the keys here - and every key must be one this
 * user was issued, or a message could carry someone else's file.
 */

const Attachment = z.object({
  key: z.string().min(1).max(400),
  name: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES)
});

const Body = z.object({
  body: z.string().max(4000).optional(),
  attachments: z.array(Attachment).max(10).default([])
});

export const POST = withLogging("anon:chat:message", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await loadChat(userId, params.id);
  if (!access.ok || !access.chat) {
    const gone = access.reason === "expired";
    return NextResponse.json({ error: gone ? "This chat has expired." : "Not found" }, { status: gone ? 410 : 404 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const check = validateMessage({ body: parsed.data.body, attachmentCount: parsed.data.attachments.length });
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const foreign = parsed.data.attachments.find((a) => !keyBelongsToUser(a.key, userId));
  if (foreign) return NextResponse.json({ error: "Unknown attachment" }, { status: 400 });

  const message = await prisma.anonMessage.create({
    data: {
      chatId: params.id,
      senderId: userId,
      kind: check.kind,
      body: check.body,
      attachments: {
        create: parsed.data.attachments.map((a) => ({
          storageKey: a.key,
          name: a.name,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          kind: attachmentKind(a.mimeType, a.name)
        }))
      }
    },
    select: {
      id: true,
      senderId: true,
      kind: true,
      body: true,
      createdAt: true,
      attachments: { select: { id: true, storageKey: true, name: true, mimeType: true, sizeBytes: true, kind: true } }
    }
  });

  logActivity("anon message sent", {
    userId,
    metadata: { chatId: params.id, kind: check.kind, files: parsed.data.attachments.length }
  });
  return NextResponse.json(message, { status: 201 });
});
