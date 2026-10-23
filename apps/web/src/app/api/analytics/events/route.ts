import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerId } from "@/lib/viewer";
import { log, newRequestId } from "@/lib/loggerServer";
import { peekUserCode } from "@/lib/userCodeServer";
import { redactMetadata } from "@/lib/logger";
import {
  SCHEMA_VERSION,
  categoryForEvent,
  severityForEvent,
  validateEvent,
  type EventPlatform
} from "@/lib/events";
import { withLogging } from "@/lib/withLogging";

/**
 * Receive a batch of client events.
 *
 * These land in the same table as everything else, so "what broke" and "what the
 * user was doing" are one query rather than a join across two systems. That is
 * the whole point of collecting analytics as diagnostics logs.
 *
 * Three rules this endpoint holds to:
 *
 *  - It validates again. The client validates so a mistake is caught where it is
 *    made; the server validates because a client is not something to trust. A
 *    hand-crafted POST must not be able to write an event the schema does not
 *    describe.
 *  - It never fails the batch on one bad event. A malformed event is recorded as
 *    malformed and the rest go through, because losing nineteen good events to
 *    punish one bad one is the wrong trade.
 *  - The user id is never taken from the body. It comes from the session, and is
 *    stored as the pseudonymous code, never a raw identifier.
 */

const MAX_EVENTS = 100;
const MAX_PROPERTIES = 30;

const Body = z.object({
  events: z
    .array(
      z.object({
        event_name: z.string().min(1).max(80),
        schema_version: z.string().max(20).optional(),
        timestamp: z.string().max(40).optional(),
        session_id: z.string().max(80).optional(),
        attempt_id: z.string().max(80).optional(),
        screen_or_route: z.string().max(200).optional(),
        log_level: z.string().max(10).optional(),
        properties: z.record(z.unknown()).optional()
      })
    )
    .min(1)
    .max(MAX_EVENTS)
});

/** Where the request came from, used only to tell app from web. */
function platformOf(req: Request, eventPlatformHeader: string | null): EventPlatform {
  if (eventPlatformHeader === "app") return "app";
  // The Android app sends its own header; a browser sends a User-Agent and no
  // custom one. This is a hint for filtering, never a security decision.
  const ua = req.headers.get("user-agent") ?? "";
  return /okhttp|expo|react-native/i.test(ua) ? "app" : "web";
}

export const POST = withLogging("analytics:events:post", async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // The account, when there is one. Never read from the body: a client that
  // could name the user could write events against someone else's name.
  //
  // peekUserCode, not ensureUserCode: analytics should not have the side effect
  // of minting an identity for someone who never asked for one.
  const userId = await getViewerId(req);
  let actorCode: string | null = null;
  if (userId) {
    try {
      actorCode = await peekUserCode(userId);
    } catch {
      actorCode = null;
    }
  }

  const platform = platformOf(req, req.headers.get("x-sangam-platform"));
  const requestId = newRequestId();
  let accepted = 0;
  let rejected = 0;

  for (const e of parsed.data.events) {
    const properties = redactMetadata((e.properties ?? {}) as Record<string, unknown>);
    if (Object.keys(properties).length > MAX_PROPERTIES) {
      rejected += 1;
      continue;
    }

    const problems = validateEvent(e.event_name, properties, platform);
    if (problems.length) {
      // Recorded, not dropped: a client shipping a bad event is itself the
      // finding, and it should be visible without reading a browser console.
      rejected += 1;
      log({
        severity: "WARN",
        category: "APPLICATION",
        message: `invalid event ${e.event_name}`,
        requestId,
        actorCode,
        userId,
        source: "analytics",
        eventName: e.event_name,
        schemaVersion: e.schema_version ?? null,
        sessionId: e.session_id ?? null,
        attemptId: e.attempt_id ?? null,
        metadata: { problems: problems.slice(0, 6) }
      });
      continue;
    }

    accepted += 1;
    log({
      severity: severityForEvent(e.event_name),
      category: categoryForEvent(e.event_name) as never,
      message: e.event_name,
      requestId,
      actorCode,
      userId,
      source: "analytics",
      eventName: e.event_name,
      schemaVersion: e.schema_version ?? SCHEMA_VERSION,
      sessionId: e.session_id ?? null,
      attemptId: e.attempt_id ?? null,
      metadata: {
        ...properties,
        // Kept so a clock that is badly wrong is visible rather than silently
        // reordering a session.
        client_ts: e.timestamp ?? null,
        screen_or_route: e.screen_or_route ?? null
      }
    });
  }

  return NextResponse.json({ accepted, rejected });
});

