import { randomBytes } from "crypto";

// W3C trace context: traceparent = 00-<32 hex trace id>-<16 hex span id>-01
// Generated per outbound call and propagated to the AI service and the worker,
// so a single request can be followed across services.
export function newTraceparent(): string {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  return `00-${traceId}-${spanId}-01`;
}

export function traceIdOf(traceparent: string | null | undefined): string | null {
  if (!traceparent) return null;
  const parts = traceparent.split("-");
  return parts.length >= 3 && parts[1].length === 32 ? parts[1] : null;
}
