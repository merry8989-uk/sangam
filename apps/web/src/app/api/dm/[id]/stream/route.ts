import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dmChannel, redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

// Server-Sent Events stream of new messages in a conversation.
// New messages are published to a Redis channel; this subscribes and forwards
// them, so the thread updates live instead of polling.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const member = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: params.id, userId } }
  });
  if (!member) return new Response("Not found", { status: 404 });

  const subscriber = redis.duplicate();
  const channel = dmChannel(params.id);
  const encoder = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let onMessage: ((ch: string, raw: string) => void) | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (onMessage) subscriber.off("message", onMessage);
    subscriber.quit().catch(() => {});
    try {
      controllerRef?.close();
    } catch {
      /* already closed */
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      onMessage = (_ch, raw) => {
        try {
          send({ type: "message", message: JSON.parse(raw) });
        } catch {
          /* ignore malformed frame */
        }
      };

      await subscriber.subscribe(channel);
      subscriber.on("message", onMessage);
      send({ type: "ready" });

      // Keep intermediaries from closing an idle connection.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* closed */
        }
      }, 20000);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
