# Sangam

**A homegrown social + video media platform, built for India** — combining the


> **On "India-hosted".** The app tier, the database, the cache and the AI service
> run in Indian regions, and every provider chosen so far was chosen for its
> Indian presence. Media storage is the one part where that is a choice rather
> than a given: the supported backends are AWS S3 in `ap-south-1`, an Indian
> provider such as E2E EOS or NxtGen, a local MinIO, and Cloudflare R2. **R2 has
> no India storage jurisdiction** — its guaranteed jurisdictions are the EU, the
> US and FedRAMP — so a deployment on R2 is not India-hosted for media. India's
> DPDP Act 2023 does not require in-country storage (section 16(1) is a blocklist,
> not a residency mandate), so this is a question of what the project promises,
> not of what the law demands. `lib/storage.ts` resolves the choice and reports
> whether the bytes leave India; `/api/health` shows it.
best ideas from Facebook (social graph, groups, feed), Instagram (visual
posts, stories, reels, discovery) and YouTube (long-form video, channels,
channel follows) into **one** product, built on our **own stack**.

> Sangam (संगम) means *confluence* — the meeting of rivers. Here, the meeting
> of three media experiences in one platform.

## Ground rules for this project

- **No third-party social APIs.** Facebook, Instagram and YouTube are used
  only as *design references*. There is no Meta or Google SDK, login, or data
  dependency anywhere in this codebase.
- **Self-hosted and India-first.** Everything runs on servers we control, in
  India, and is designed around the **Digital Personal Data Protection (DPDP)
  Act, 2023**.
- **Realistic scope.** This repo is a *working foundation*, not a finished
  clone of three platforms. See [docs/BLUEPRINT.md](docs/BLUEPRINT.md) for an
  honest breakdown of what exists, what's next, and what is genuinely hard.

## What's in the box

| Area | Status |
| --- | --- |
| Monorepo (web + AI service + infra) | ✅ scaffolded |
| Own auth (email + password; OTP-ready) | ✅ |
| User profiles, follow graph | ✅ |
| Posts (text/image/video/short) + feed with Redis fan-out | ✅ |
| Direct-to-storage uploads via pre-signed URLs | ✅ |
| AI service: multi-stage recommender + multilingual moderation | ✅ |
| Ranked 'For you' feed + moderation review queue | ✅ |
| Likes, comments, follow (API + UI) | ✅ |
| Stories (24h), Search, Explore, hashtag pages | ✅ |
| Channel pages, watch page, Following feed | ✅ |
| Batched view counters (Redis) + flush job | ✅ |
| Streaming chat (SSE) + scheduler job for agent tasks | ✅ |
| Structured logs + /metrics; /api/health | ✅ |
| Real moderation models (multilingual text + NSFW vision), opt-in | ✅ |
| Embeddings-based knowledge retrieval for agents | ✅ |
| Creator studio: analytics + agent assist | ✅ |
| AI chat (Sarvam Indus / sarvam-105b), no login required | ✅ |
| One agent per user + public Agent API (Bearer key) | ✅ |
| AI side bar (docked; collapses on navigation) | ✅ |
| Image pipeline: upload -> thumbnails (WebP) -> feed | ✅ |
| Docker Compose dev stack (Postgres, Redis, MinIO) | ✅ |
| CI (lint, build, import checks) | ✅ |
| Video pipeline: FFmpeg -> ABR HLS ladder -> player -> Shorts | ✅ |
| Hover preview clips + processing status polling | ✅ |
| Notifications (like/comment/follow) + nav bell | ✅ |
| Profile settings (name, bio, avatar, cover) + delete own post | ✅ |
| Direct messaging (1:1) with live SSE delivery | ✅ |
| Bookmarks / saved posts | ✅ |
| Block, mute and report | ✅ |
| Groups / communities (public + private) | ✅ |
| Media enrichment queue worker (apps/worker) | ✅ |
| GPU/ML inference split (ML_INFERENCE_URL) | ✅ |
| Analytics store: daily view rollups + studio trend | ✅ |
| Distributed tracing (W3C traceparent) | ✅ |
| Stories expiry sweeper (rows + storage objects) | ✅ |
| Meilisearch search (optional, Postgres fallback) | ✅ |
| Error budgets (SLOs) + alerting, with an /ops page | ✅ |
| Full Settings: appearance, quality, posts, comments, sharing, history, moderation | ✅ |
| Reddit-style branch comments (toggleable) | ✅ |
| DM custom wallpaper + watch history with reset | ✅ |
| Theme engine: 480 themes, day/week/month/year rotation, mood-driven | ✅ |
| Android app (Expo / React Native) with Bearer-token auth | ✅ |
| Custom skip points (per-user or shared, with community voting) | ✅ |
| Video quality control: 144p to 2K, per-rendition selection, upload caps | ✅ |
| Thumbnail control: pick the poster frame from a generated filmstrip | ✅ |
| Live streaming: RTMP ingest, go live from phone or laptop | ✅ |
| Calls (1:1) and meetings (group), one room model | ✅ |
| Calls / meetings / live control settings | ✅ |
| My Drive: notes, sheets, documents, slides and uploads of any file type | ✅ |
| Nav folded into a More menu | ✅ |
| Terabox linking from the drive (official OAuth or session token) | ✅ |
| Zoho WorkDrive: create sheets/documents/slides and upload from the drive | ✅ |
| Drive sharing: with people or by link, folders inherit | ✅ |
| Zoho WorkDrive large-file upload (streamed, not buffered) | ✅ |
| Backup to Zoho or Google Drive: chats, searches, watch history | ✅ |
| Backups encrypted at rest (AES-256-GCM, server key or passphrase) | ✅ |
| Restore a backup back in, with a preview and no duplicates | ✅ |
| Stories, Reels, DMs, Live, Groups, Search | ⏳ roadmap |
| Recommendation ML, analytics | ⏳ roadmap |

## Architecture at a glance

```
        Browser / Android / iOS
                 │
           CDN + Edge  (India PoPs)
                 │
        ┌────────┴─────────┐
        │  Next.js app      │  web UI + JSON API
        │  (apps/web)       │
        └────────┬─────────┘
     ┌───────────┼───────────────┐
     │           │               │
 Postgres      Redis          MinIO / S3
 (metadata)   (feeds,        (media objects,
              counters)       India region)
     │
 FastAPI AI service (apps/ai)  ── moderation, ranking, enrichment
```

## Quickstart (local)

**Prerequisites:** Docker Desktop (or Docker Engine + Compose). Nothing else is
needed - Postgres, Redis, MinIO, Meilisearch, the AI service and the media
worker all run in containers.

```bash
git clone https://github.com/merry8989-uk/sangam.git
cd sangam
cp .env.example .env          # then edit the secrets
docker compose up --build     # first build takes a few minutes
```

Open http://localhost:3000 and register an account.

Notes:
- The web container applies the database schema on startup (`prisma db push`),
  so there is no separate migration step.
- **Chat needs a key.** Put `SARVAM_API_KEY=...` in `.env` (get one from
  https://dashboard.sarvam.ai/). Everything else works without it.
- To use the durable media queue and the GPU/ML inference worker, see
  [docs/JOBS.md](docs/JOBS.md) and set `MEDIA_QUEUE_ENABLED=true`.

Diagnostics: a user can send you the technical detail instead of describing it.

- `/diagnostics` collects app version, device, route, recorded errors and server
  health checks, writes it as Markdown, JSON, text or CSV, and opens the user's
  mail client with the subject and body already written.
- It is recorded on the device only. Nothing is uploaded until the user presses
  Send. Passwords, tokens and post or message content are stripped before a
  report is built, and stripped again on the server.
- On by default, and switchable off in Settings.
- Set `DIAGNOSTICS_SUPPORT_EMAIL` to the address reports should go to. It is an
  environment value rather than a constant, so your address is not published
  with the source.
- To have the report arrive **attached with no step from the user**, set
  `EMAIL_PROVIDER`, `EMAIL_API_KEY` and `EMAIL_FROM`. The server then sends it.
  Without those, the app uses the share sheet (which attaches the file on a
  phone) or Gmail compose (which cannot attach - the URL has no field for a
  file), and saves the report for the user to attach.
- The recipient is always `DIAGNOSTICS_SUPPORT_EMAIL` from the environment,
  never from the request. Accepting a recipient would make the endpoint an open
  relay. It is also rate limited per account.
- Reports live in Sangam's own database. There is no third-party mirror: the
  guarded internal endpoint reads them, and a support view in the UI is on the
  pending list.
- Every account gets a **user code** (`SG-7K2M4P`) the first time one is needed.
  It is what support sees - the report carries the code and not the account id,
  the name or the email. The code survives a support thread, so it is never
  regenerated.
- The diagnostics screen has a **filter** over the recorded events: severity,
  kind, outcome, session, and a text search. The export and the email use the
  same filter, so what you send is what you see.

Logging: twelve categories, six severities, one envelope.

- Every record carries `ts`, `severity`, `category`, `message`, `appId`,
  `environment` and `requestId`, with redacted metadata on top.
- `withLogging(name, handler)` wraps a route and emits an API line per request,
  a SECURITY line on 401 and 403, a PERFORMANCE line when it was slow, and an
  ERROR line when it threw. It also puts a request id on the response, so a user
  can quote one number and every line from that request can be found - across
  the web tier, the AI service and the worker.
- Errors and above are never sampled. High-volume ordinary categories are, so a
  busy day does not bury the failures.
- Redaction runs on the way in, on both the message and the metadata **keys**.
  A log line is copied into a backup, an export and a support ticket.
- `/logs` reads them back with search, filters, a live tail and CSV, text or
  JSON export. Operators only - the guard is in the page and in the API.
- Retention is per category: an audit trail for a year, trace lines for three
  days. `POST /api/internal/prune-logs` applies it.
- `LOG_LEVEL`, `APP_ID`, `APP_ENV`, `LOG_SYNC` and `LOG_RETENTION_JSON` are in
  `.env.example`.

Analytics and crash reports are diagnostics logs, not a separate system.

- One table holds both, so "what broke" and "what the user was doing" are one
  query rather than a join across two systems that were never designed to meet.
- The schema is shared with the Android app: `event_name` in `object_action`
  snake_case, a `session_id`, and an `attempt_id` that groups an intent with its
  outcome. An event carries intent, outcome and context together, never intent
  alone - that rule came from a log that showed 71 "fix requested" entries and
  not one "fix result".
- `/logs` lists the attempts that were opened and never closed, because that
  list is the answer the log could not give.
- Consent defaults to **off**, unlike diagnostics. Diagnostics is something a
  user asks for; analytics is something the product does quietly.
- `python3 tools/check-events.py` validates the schema and every call site, and
  CI runs it. See `docs/EVENTS.md`.

Media is served through one gate.

- `/api/media/[...key]` used to redirect anyone with a key straight to the
  object, and every post response carries its keys. It now resolves the key
  against the viewer and applies the same rules the post itself obeys: the
  author always, a public post to anyone, a followers-only post to a follower, a
  private post to nobody else. A denial is a 404.
- The answer is a short-lived presigned URL rather than the public bucket base.
- `lib/mediaAccess.ts` holds the rule, so the redirect and the frame and poster
  routes cannot disagree.
- Cost: one database lookup per media request. The production answer is a CDN
  with signed URLs; it is on the pending list.

Anonymous chat: two keys, and the difference is the feature.

- **Your fixed key** (`SGX-…`) is permanent. A chat opened with it is a normal
  chat - it stays until someone deletes it.
- **A temporary key** (`SGT-…`) is minted for one chat with a duration you pick,
  ten seconds at the least. The first use creates the chat; every later use joins
  the same one, which is how a temporary *group* forms. When the time is up the
  key is destroyed and the chat is **deleted from both sides** - the rows, the
  files in object storage, and the key. Not hidden, not archived. That is
  `POST /api/internal/expire-anon`, and it runs every minute.
- **Messages are write-once.** There is no `updatedAt` in the schema, no update
  handler in the API, and `tools/check-immutable.py` in CI. Three locks, because
  a rule that lives only in a document gets broken by the next person.
- Any file type can be sent: documents, PDFs, images, video, audio, gifs,
  stickers, links.
- Video, audio and group calls run on the same LiveKit room - what the call is
  depends on what people publish, not on a different endpoint. Virtual
  backgrounds apply to the local track; without `@livekit/track-processors` the
  control blurs the preview instead, which is honest rather than silent.
- Nothing in a chat shows a name. A chat is titled by its mode and how long it
  has left.

The Android app updates itself: it checks `/api/app/version` on launch, and when
there is a newer build it draws a real progress bar from the bytes actually
written, then hands the file to Android's own installer. It never replaces itself
without a press.

Check the whole database schema without Docker:

```bash
pip install pgserver
python tools/verify-schema.py     # starts its own PostgreSQL, applies every model
```

It applies all 39 models to a real PostgreSQL and fails if anything is
unexecutable. It drives Prisma's *native* schema engine directly, because the
Prisma CLI bundles a WebAssembly build that fails to allocate on a small
machine - see the header of the script.

The media pipeline has an end-to-end test: `python apps/ai/tests/e2e_pipeline.py`
builds a real clip and runs the whole transcode + thumbnail path through the
service. See `apps/ai/tests/e2e_pipeline.py`.

The Android client lives in `apps/mobile` - see [apps/mobile/README.md](apps/mobile/README.md).

Running the web app outside Docker instead? Apply the schema yourself:

```bash
npm install
npm --workspace apps/web run db:push   # creates/updates all tables
npm run dev
```

Without this step Prisma will query tables that do not exist yet and the app
will error. For production, use committed migrations rather than `db push`:
`npx prisma migrate dev` to create one, `npx prisma migrate deploy` to apply.

## Repository layout

```
apps/
  web/     Next.js 14 (App Router, TypeScript, Prisma, NextAuth, Tailwind)
  ai/      FastAPI service (moderation, ranking, media enrichment)
docs/
  BLUEPRINT.md   product + engineering blueprint (the reference analysis)
  ROADMAP.md     phased delivery plan
.github/workflows/ci.yml
docker-compose.yml
```

## Documentation

- **[docs/BLUEPRINT.md](docs/BLUEPRINT.md)** — reference analysis of
  Facebook/Instagram/YouTube, unified feature matrix, architecture, security,
  AI plan, hosting and cost.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — what to build, in what order.

## License

MIT — see [LICENSE](LICENSE).
