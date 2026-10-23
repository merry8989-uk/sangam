/**
 * The event catalog, and the rules that keep it a schema rather than a habit.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS MIRRORED FROM apps/web/src/lib/events.ts. Do not edit it here.
 *
 * The standard asks for one shared schema so app and web data joins cleanly.
 * The mobile app is not a workspace of the web app, so it cannot import the
 * original; the file is copied instead, and `tools/check-events.py` fails the
 * build if the two ever differ. A mirror with a gate is a checked invariant; a
 * mirror without one is drift waiting to happen.
 *
 * Edit the web copy, then run:  python3 tools/sync-events.py
 * ---------------------------------------------------------------------------
 *
 * This is the shared standard for both the Android app and the web, so the two
 * can be joined and compared. It exists because of a specific failure: a
 * diagnostics log showed 71 "access fix requested" entries and not one "fix
 * result". The log proved a user was stuck in a loop and could not say why.
 *
 * The rule that came out of it, and the one this file enforces:
 *
 *   An event must carry intent, outcome and context together - not intent
 *   alone. `access_fix_requested` and `access_fix_result` share an `attempt_id`,
 *   so the two halves of one user action are one story.
 *
 * Kept pure. The validator runs in CI and again at the call site, and both use
 * the same rules, so an event cannot be valid in one place and invalid in the
 * other.
 */

export const SCHEMA_VERSION = "1.0.0";

export const EVENT_PLATFORMS = ["app", "web"] as const;
export type EventPlatform = (typeof EVENT_PLATFORMS)[number];

/** Which side of the product an event can come from. */
export type EventSource = "app" | "web" | "both";

/** The four levels the standard names. The logger has six; these map onto them. */
export const EVENT_LEVELS = ["debug", "info", "warn", "error"] as const;
export type EventLevel = (typeof EVENT_LEVELS)[number];

/** Fixed sets. The standard is explicit: an enum is never sent as free text. */
export const ENUMS = {
  outcome: ["success", "failure", "noop"],
  network_type: ["wifi", "cellular", "ethernet", "offline", "unknown"],
  release_channel: ["production", "beta", "development"],
  start_type: ["cold", "warm"],
  permission_state: ["granted", "partial", "denied", "permanently_denied"],
  flow: ["app_start", "screen_render", "scroll", "media_load", "transcode"],
  signal: ["rage_click", "dead_click", "back_button_spam", "permission_loop"],
  goal: ["signup", "first_post", "first_upload", "follow", "share", "subscribe"]
} as const;

export type EnumName = keyof typeof ENUMS;

/** A property's shape. `enum:` names a set above; the rest are primitives. */
export type PropSpec =
  | "string"
  | "number"
  | "boolean"
  | "iso8601"
  | { enum: EnumName }
  | { array: "string" | "number" };

export type EventSpec = {
  /** app | web | both */
  source: EventSource;
  /** The level this event is logged at, by default. */
  level: EventLevel;
  /** Properties that must be present. */
  required: Record<string, PropSpec>;
  /** Properties that may be present. */
  optional: Record<string, PropSpec>;
  /** What it means, so the next person does not have to guess. */
  about: string;
};

/**
 * Every event, in one place. Names follow `object_action` in snake_case.
 *
 * The three groups match the standard: app events, web events, and the
 * user-friendliness signals that expose friction directly.
 */
export const EVENTS: Record<string, EventSpec> = {
  // ---------------------------------------------------------------- session
  session_start: {
    source: "both",
    level: "info",
    required: { start_type: { enum: "start_type" } },
    optional: { cold_start_ms: "number", warm_start_ms: "number" },
    about: "An app launch or a first page view. Session context is sent with it, once."
  },
  session_end: {
    source: "both",
    level: "info",
    required: { duration_ms: "number" },
    optional: { last_screen: "string", event_count: "number" },
    about: "The session finished. The last screen is how a drop-off is found."
  },

  // --------------------------------------------------------------- app only
  screen_view: {
    source: "app",
    level: "info",
    required: { screen_name: "string" },
    optional: { previous_screen: "string", duration_ms: "number" },
    about: "A screen is shown. The pair of screens is a navigation path."
  },
  permission_state_resolved: {
    source: "app",
    level: "info",
    required: { permission: "string", state: { enum: "permission_state" } },
    optional: { media_item_count: "number" },
    about: "The result of checking a permission, with how much it made visible."
  },
  access_fix_requested: {
    source: "app",
    level: "info",
    required: { permission: "string", state_before: { enum: "permission_state" } },
    optional: {},
    about: "The user tapped a fix action. Carries an attempt_id; the result answers it."
  },
  access_fix_result: {
    source: "app",
    level: "info",
    required: { action_taken: "string", state_after: { enum: "permission_state" }, outcome: { enum: "outcome" } },
    optional: { error_code: "string", media_item_count: "number" },
    about: "The fix finished. Shares its attempt_id with the request. This is the event whose absence started all of this."
  },
  media_query_result: {
    source: "app",
    level: "debug",
    required: { item_count: "number" },
    optional: { query_ms: "number", folders_visible: "number" },
    about: "A media query returned. A zero item_count is why someone sees an empty screen."
  },
  anr: {
    source: "app",
    level: "error",
    required: { duration_ms: "number" },
    optional: { last_screen: "string" },
    about: "The app stopped responding."
  },
  performance_marker: {
    source: "both",
    level: "debug",
    required: { flow: { enum: "flow" }, duration_ms: "number" },
    optional: { frame_drops: "number" },
    about: "A key flow finished, and how long it took."
  },
  error_state_shown: {
    source: "both",
    level: "warn",
    required: { error_code: "string" },
    optional: { screen: "string", message_key: "string" },
    about: "An error was put in front of the user. A friction point, not a failure."
  },

  // --------------------------------------------------------------- web only
  page_view: {
    source: "web",
    level: "info",
    required: { url_path: "string" },
    optional: { referrer: "string", title: "string" },
    about: "A page loaded. With the referrer and the path, this is the shape of a visit."
  },
  web_vitals: {
    source: "web",
    level: "info",
    required: { lcp_ms: "number" },
    optional: { cls: "number", inp_ms: "number", ttfb_ms: "number" },
    about: "The Core Web Vitals for a page load."
  },
  form_start: {
    source: "web",
    level: "info",
    required: { form_id: "string" },
    optional: { field_count: "number" },
    about: "A form was started. The pair with form_abandon or form_submit is the completion rate."
  },
  form_abandon: {
    source: "web",
    level: "warn",
    required: { form_id: "string" },
    optional: { step: "string", time_on_form_ms: "number" },
    about: "A form was left unfinished. Where it was left is the useful part."
  },
  form_submit: {
    source: "web",
    level: "info",
    required: { form_id: "string", outcome: { enum: "outcome" } },
    optional: { step: "string", time_on_form_ms: "number" },
    about: "A form was submitted, and whether it worked."
  },
  search_performed: {
    source: "both",
    level: "info",
    required: { query_length: "number" },
    optional: { result_count: "number", filters: { array: "string" } },
    about: "A search ran. The query itself is never logged - only how long it was."
  },
  search_no_results: {
    source: "both",
    level: "warn",
    required: { query_length: "number" },
    optional: { filters: { array: "string" } },
    about: "A search returned nothing. Usually a catalogue gap, not a bug."
  },
  settings_save_requested: {
    source: "both",
    level: "info",
    required: { setting_count: "number" },
    optional: { section: "string" },
    about:
      "The user changed a setting and it was sent. Carries an attempt_id; the result answers it. The standard's rule is that intent and outcome travel together, and this is the intent half of the most common action in the product."
  },
  settings_save_result: {
    source: "both",
    level: "info",
    required: { outcome: { enum: "outcome" } },
    optional: { error_code: "string", setting_count: "number" },
    about:
      "A settings save finished, and whether it worked. Shares its attempt_id with the request, so a save that was sent and never answered is visible as exactly that rather than as a setting that quietly did not stick."
  },
  conversion: {
    source: "both",
    level: "info",
    required: { goal_name: { enum: "goal" } },
    optional: { value: "number", source: "string" },
    about: "A goal was reached - a signup, a first post, a first upload. The end of a funnel."
  },
  feedback_submitted: {
    source: "both",
    level: "info",
    required: { rating: "number" },
    optional: { page: "string" },
    about: "The feedback widget was used."
  },

  // ----------------------------------------------------------- shared: errors
  api_request: {
    source: "both",
    level: "info",
    required: { endpoint: "string", method: "string", status_code: "number" },
    optional: { latency_ms: "number", retry_count: "number" },
    about: "Any network call, from either side."
  },
  crash: {
    source: "both",
    level: "error",
    required: { fatal: "boolean", exception_type: "string" },
    optional: { stack_trace_hash: "string", last_screen: "string", last_action: "string" },
    about: "An uncaught exception. The hash groups occurrences; the raw stack is not kept."
  },
  js_error: {
    source: "web",
    level: "error",
    required: { error_type: "string" },
    optional: { stack_hash: "string", url: "string", browser: "string" },
    about: "An unhandled error on the web."
  },

  // ------------------------------------------------- user-friendliness signals
  friction_signal: {
    source: "both",
    level: "warn",
    required: { signal: { enum: "signal" }, element: "string" },
    optional: { count: "number", window_ms: "number" },
    about:
      "Something looked usable and was not: three taps on the same element in two seconds, a tap that did nothing, three backs in two seconds. One event covers all of them, told apart by `signal`, so a new signal is a value rather than a new event."
  },
  scroll_depth: {
    source: "both",
    level: "debug",
    required: { percent: "number" },
    optional: { screen: "string" },
    about: "How far a page or list was scrolled."
  },
  drop_off: {
    source: "both",
    level: "info",
    required: { step: "string" },
    optional: { previous_step: "string", time_on_step_ms: "number" },
    about: "Where a session ended on a funnel step."
  },
  time_to_first_value: {
    source: "both",
    level: "info",
    required: { duration_ms: "number" },
    optional: { first_action: "string" },
    about: "From session start to the first meaningful action. Onboarding speed."
  }
};

export const EVENT_NAMES = Object.keys(EVENTS);

/**
 * Events that open an attempt. Each must be answered by an event that closes it
 * - `access_fix_requested` by `access_fix_result`. This map is what makes the
 * standard's core rule checkable rather than aspirational.
 */
export const ATTEMPT_PAIRS: Record<string, string> = {
  // From the standard: the flow whose missing result half started all of this.
  access_fix_requested: "access_fix_result",
  // Sangam's own: the most common intent in the product, and the one where a
  // silent failure looks like a setting that did not stick.
  settings_save_requested: "settings_save_result"
};

/** Every event that opens an attempt, as a set, for the readers that need it. */
export const ATTEMPT_OPENERS: Record<string, true> = Object.fromEntries(
  Object.keys(ATTEMPT_PAIRS).map((k) => [k, true])
) as Record<string, true>;

/** Events whose properties name a matching pair, so a dangling attempt is visible. */
export function pairFor(eventName: string): string | undefined {
  return ATTEMPT_PAIRS[eventName];
}

/** Is this event one that must carry an attempt_id? */
export function needsAttemptId(eventName: string): boolean {
  return eventName in ATTEMPT_PAIRS || Object.values(ATTEMPT_PAIRS).includes(eventName);
}

export function isEventName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENTS, name);
}

/** `access_fix_result` is fine; `FixAccessResult` and `access-fix` are not. */
export function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
}

function checkOne(key: string, spec: PropSpec, value: unknown, problems: string[]): void {
  const where = `property \`${key}\``;
  if (typeof spec === "string") {
    switch (spec) {
      case "string":
        if (typeof value !== "string") problems.push(`${where} must be a string`);
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) problems.push(`${where} must be a finite number`);
        break;
      case "boolean":
        if (typeof value !== "boolean") problems.push(`${where} must be a boolean`);
        break;
      case "iso8601":
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) problems.push(`${where} must be an ISO 8601 timestamp`);
        break;
    }
    return;
  }
  if ("enum" in spec) {
    const allowed = ENUMS[spec.enum] as readonly unknown[];
    if (!allowed.includes(value)) {
      problems.push(`${where} must be one of ${allowed.join(", ")} (got ${JSON.stringify(value)})`);
    }
    return;
  }
  if ("array" in spec) {
    if (!Array.isArray(value)) {
      problems.push(`${where} must be an array`);
      return;
    }
    const want = spec.array;
    if (!value.every((v) => (want === "string" ? typeof v === "string" : typeof v === "number"))) {
      problems.push(`${where} must be an array of ${want}`);
    }
  }
}

/**
 * Validate one event against the catalog.
 *
 * Returns the problems, empty when it is valid. Used in CI, and again at the
 * call site in development so a mistake is caught where it is made.
 */
export function validateEvent(
  eventName: string,
  props: Record<string, unknown> = {},
  platform?: EventPlatform
): string[] {
  const problems: string[] = [];

  if (!isEventName(eventName)) {
    return [`unknown event \`${eventName}\``];
  }
  if (!isSnakeCase(eventName)) {
    problems.push(`event name \`${eventName}\` is not object_action snake_case`);
  }

  const spec = EVENTS[eventName];

  if (platform) {
    if (spec.source !== "both" && spec.source !== platform) {
      problems.push(`\`${eventName}\` is a ${spec.source} event, not ${platform}`);
    }
  }

  for (const [key, propSpec] of Object.entries(spec.required)) {
    if (!(key in props) || props[key] === undefined || props[key] === null) {
      problems.push(`missing required property \`${key}\``);
      continue;
    }
    checkOne(key, propSpec, props[key], problems);
  }

  for (const [key, propSpec] of Object.entries(spec.optional)) {
    if (props[key] === undefined || props[key] === null) continue;
    checkOne(key, propSpec, props[key], problems);
  }

  for (const key of Object.keys(props)) {
    if (!(key in spec.required) && !(key in spec.optional)) {
      problems.push(`unexpected property \`${key}\``);
    }
  }

  return problems;
}

/** Validate a whole batch, as CI does. */
export function validateBatch(
  batch: { event: string; props?: Record<string, unknown>; platform?: EventPlatform }[]
): { event: string; problems: string[] }[] {
  return batch
    .map((e) => ({ event: e.event, problems: validateEvent(e.event, e.props ?? {}, e.platform) }))
    .filter((r) => r.problems.length > 0);
}

/**
 * The session context, sent once per session rather than on every event.
 *
 * A session is a launch or a visit. Repeating the device on every event is the
 * single largest waste in a log at scale, and the standard calls it out.
 */
export type SessionContext = {
  platform: EventPlatform;
  app_version: string;
  os: string;
  device_model: string;
  network_type: (typeof ENUMS.network_type)[number];
  release_channel: (typeof ENUMS.release_channel)[number];
  screen_or_route: string;
};

export const SESSION_CONTEXT_KEYS: (keyof SessionContext)[] = [
  "platform",
  "app_version",
  "os",
  "device_model",
  "network_type",
  "release_channel",
  "screen_or_route"
];

/** Fill in what we can, and be honest about what we cannot. */
export function buildSessionContext(input: Partial<SessionContext> = {}): SessionContext {
  return {
    platform: input.platform === "app" ? "app" : "web",
    app_version: input.app_version || "unknown",
    os: input.os || "unknown",
    device_model: input.device_model || "unknown",
    network_type: input.network_type || "unknown",
    release_channel: input.release_channel || "development",
    screen_or_route: input.screen_or_route || "/"
  };
}

/**
 * Is a session context complete enough to send? An incomplete one is worth
 * sending with `unknown` in it rather than not sending it - but a CI check
 * fails if the values are never set at all.
 */
export function sessionContextProblems(ctx: Partial<SessionContext>): string[] {
  const problems: string[] = [];
  for (const key of SESSION_CONTEXT_KEYS) {
    if (!ctx[key]) problems.push(`session context is missing \`${key}\``);
  }
  return problems;
}

/**
 * Which of the logger's twelve categories an event belongs in, and at what
 * severity.
 *
 * The two standards are layers, not alternatives. The category is the class of
 * log - what kind of thing happened - and the event name is the specific thing.
 * So a crash is an ERROR-category record whose event name is `crash`, and a
 * page view is an ACTIVITY record whose event name is `page_view`. Keeping both
 * means one query can ask either question.
 */
export function categoryForEvent(eventName: string): string {
  switch (eventName) {
    case "crash":
    case "js_error":
      return "ERROR";
    case "api_request":
      return "API";
    case "web_vitals":
    case "performance_marker":
      return "PERFORMANCE";
    case "anr":
      return "ERROR";
    case "page_view":
    case "screen_view":
    case "session_start":
    case "session_end":
    case "scroll_depth":
    case "drop_off":
    case "time_to_first_value":
    case "friction_signal":
    case "error_state_shown":
    case "permission_state_resolved":
    case "access_fix_requested":
    case "access_fix_result":
    case "media_query_result":
    case "search_performed":
    case "search_no_results":
    case "form_start":
    case "form_abandon":
    case "form_submit":
    case "feedback_submitted":
      return "ACTIVITY";
    case "conversion":
      return "ANALYTICS";
    case "settings_save_requested":
    case "settings_save_result":
      return "AUDIT";
    default:
      return "APPLICATION";
  }
}

/** The logger's severity for an event's level. */
export function severityForEvent(eventName: string): "DEBUG" | "INFO" | "WARN" | "ERROR" {
  const level = EVENTS[eventName]?.level ?? "info";
  switch (level) {
    case "debug":
      return "DEBUG";
    case "warn":
      return "WARN";
    case "error":
      return "ERROR";
    default:
      return "INFO";
  }
}

/** Every event, grouped by the platform it can come from. For a CI report. */
export function eventsBySource(): Record<string, string[]> {
  const out: Record<string, string[]> = { app: [], web: [], both: [] };
  for (const [name, spec] of Object.entries(EVENTS)) out[spec.source].push(name);
  return out;
}
