import { newRequestId, logError, logPerformance, logSecurity } from "./loggerServer";
import { log } from "./loggerServer";

/**
 * Wrap a route handler so every request leaves a record.
 *
 * Used as:
 *
 *   export const GET = withLogging("posts:list", async (req) => { ... });
 *   export const GET = withLogging("posts:read", async (req, { params }) => { ... });
 *
 * What it emits:
 *
 *   API          one line per request - method, path, status, duration
 *   SECURITY     on 401 and 403, because a refused request is a security event
 *   PERFORMANCE  when the request took longer than the slow threshold
 *   ERROR        when the handler threw, with the error reduced to metadata
 *
 * It also puts a request id on the response, so a user can quote one number and
 * every line from that request can be found - across the web tier, the AI
 * service and the worker, since the id is propagated on outbound calls.
 *
 * This is not applied to every route. Wrapping 87 handlers mechanically is a
 * change nobody can review, so it is applied where a request is worth being
 * able to explain afterwards: signing in, posting, uploading, messaging,
 * settings, drive, rooms and the job endpoints. The rest can adopt it as they
 * are touched.
 */

export const SLOW_REQUEST_MS = 1000;

/** The path without the query, and without an id that would fragment the logs. */
export function routeLabel(pathname: string): string {
  return pathname.replace(/\/[0-9a-f]{20,}/gi, "/:id").replace(/\/c[a-z0-9]{20,}/gi, "/:id");
}

type Handler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;

export function withLogging(name: string, handler: Handler): Handler {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    const started = Date.now();
    // Honour an id from an upstream service, so a chain of calls shares one.
    const incoming = req.headers.get("x-request-id") ?? req.headers.get("traceparent");
    const requestId = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : newRequestId();

    let status = 500;
    try {
      const res = await handler(req, ctx);
      status = res.status;

      // Pass the id back, so a user can quote it from the network tab.
      try {
        res.headers.set("x-request-id", requestId);
      } catch {
        // Some response objects are immutable; the log still has the id.
      }
      return res;
    } catch (err) {
      logError(`${name} threw`, err, { requestId, source: name });
      return Response.json({ error: "Internal error", requestId }, { status: 500 });
    } finally {
      const ms = Date.now() - started;
      const url = new URL(req.url);

      log({
        severity: status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO",
        category: "API",
        message: `${req.method} ${routeLabel(url.pathname)} ${status}`,
        requestId,
        source: name,
        metadata: { method: req.method, status, ms }
      });

      if (status === 401 || status === 403) {
        // A refused request is worth being able to count later: a run of 403s
        // from one place is the shape of someone probing.
        logSecurity(`${req.method} ${routeLabel(url.pathname)} refused (${status})`, {
          requestId,
          source: name,
          metadata: { status, ip: clientIp(req) }
        });
      }

      if (ms >= SLOW_REQUEST_MS) {
        logPerformance(`${req.method} ${routeLabel(url.pathname)} was slow`, ms, {
          requestId,
          source: name,
          metadata: { status }
        });
      }
    }
  };
}

/**
 * The caller's address, for a security record.
 *
 * Read from the forwarding header, which a proxy sets. It is not trusted for
 * anything but counting - never for a decision - because a client can send it.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "unknown";
}
