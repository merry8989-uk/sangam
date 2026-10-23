# The event standard

Analytics and crash reports are collected as diagnostics logs, not in a separate
system. One table holds both, so "what broke" and "what the user was doing" are
one query rather than a join across two systems that were never designed to meet.

The standard is the shared one for the Android app and the web, so the two can be
joined and compared.

## Why it exists

A diagnostics log showed **71 "access fix requested" entries and not one "fix
result"**. The log proved a user was stuck in a loop and could not say why.

The rule that came out of it, and the one the schema enforces:

> An event must carry **intent, outcome and context together** — not intent alone.

`access_fix_requested` and `access_fix_result` share an `attempt_id`, so the two
halves of one user action are one story. The log screen has a panel that lists
the attempts which were opened and never closed, because that list is the answer
to the question the log could not answer.

## The envelope

Every event carries these. Event-specific properties are added on top.

| Field | Notes |
| --- | --- |
| `event_name` | `object_action` in snake_case |
| `schema_version` | `1.0.0`; bumped on a breaking change |
| `timestamp` | ISO 8601, UTC. The client's clock; drift is kept, not corrected |
| `session_id` | one per app launch or visit |
| `attempt_id` | groups an intent with its outcome |
| `user_id` | the pseudonymous code, never a raw identifier |
| `platform` | `app` or `web` |
| `app_version` | with the build number |
| `os`, `device_model` | |
| `network_type` | `wifi`, `cellular`, `ethernet`, `offline`, `unknown` |
| `screen_or_route` | |
| `log_level` | `debug`, `info`, `warn`, `error` |
| `release_channel` | `production`, `beta`, `development` |

**Session context is sent once**, with `session_start`, not repeated on every
event. Repeating the device on every line is the largest waste in a log at
scale, and it is what makes a log unreadable when you are looking for a pattern
rather than a single line.

## The two layers

The log categories and the event names are layers, not alternatives. The category
is the class of log; the event name is the specific thing.

| Event | Category | Severity |
| --- | --- | --- |
| `crash`, `js_error`, `anr` | `ERROR` | error |
| `api_request` | `API` | info |
| `web_vitals`, `performance_marker` | `PERFORMANCE` | info / debug |
| `conversion` | `ANALYTICS` | info |
| everything else | `ACTIVITY` | per the event's level |

Keeping both means one query can ask either question.

## Rules the schema holds to

- **Structured, never free text.** Every event is validated against the catalog.
- **Enums are fixed.** A value outside the set is rejected, not stored.
- **Search is logged as `query_length`, never the query.** The same for a file
  name, an email, a phone number and a location — none of them are loggable.
- **A stack is hashed, never stored.** The hash groups occurrences; the raw stack
  is file paths that change every deploy and the likeliest place for a stray
  value to be sitting.
- **Errors are never sampled.** High-volume ordinary events are.
- **Redaction is identical on app and web**, and runs on the message and on the
  metadata *keys*, not only the values.

## Consent

`analyticsEnabled` defaults to **off**, unlike diagnostics. Diagnostics is
something a user asks for, to report a problem; analytics is something the
product does quietly. Those are different asks, and DPDP wants consent for the
second one.

The gate is checked inside `track`, so a new call site cannot forget it.

## Where things live

| File | What it is |
| --- | --- |
| `apps/web/src/lib/events.ts` | the catalog, the enums, the validator. Pure |
| `apps/web/src/lib/analytics.ts` | the client: consent, session, attempt pairing |
| `apps/web/src/lib/logger.ts` | the envelope and the log rules |
| `apps/web/src/lib/loggerServer.ts` | the sink |
| `apps/web/src/app/api/analytics/events/route.ts` | receives a batch, validates again |
| `apps/web/src/components/AnalyticsCapture.tsx` | page views, vitals, errors, friction |
| `tools/check-events.py` | the CI gate |

## Adding an event

1. Add it to `EVENTS` in `lib/events.ts`, with a `source`, a `level`, its
   required and optional properties, and an `about` that explains it.
2. If it opens an action with a result, add it to `ATTEMPT_PAIRS`.
3. Run `python3 tools/check-events.py`. CI runs the same check.
4. Test it on a real device or browser. A log that never fires is worse than none.

The CI gate fails on: an unknown event name at a call site, a property pointing
at an enum that does not exist, a name that is not snake_case, an entry with no
explanation, and an event used on the platform it does not belong to.

## What is not done yet

- The Android side emits none of this. The catalog and the client module are
  written to be shared; the wiring is not there.
- `dead_click` is best effort on the web and cannot be done at all on Android
  without a native hook.
- Nothing ships to an external collector yet.
