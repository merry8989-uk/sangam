# Sangam

**A homegrown, India-hosted social + video media platform** — combining the
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
| Video quality control: per-rendition selection, upload caps, data saver | ✅ |
| Thumbnail control: pick the poster frame from a generated filmstrip | ✅ |
| Live streaming: RTMP ingest, go live from phone or laptop | ✅ |
| Calls (1:1) and meetings (group), one room model | ✅ |
| Calls / meetings / live control settings | ✅ |
| My Drive: notes, sheets, documents, slides and uploads of any file type | ✅ |
| Nav folded into a More menu | ✅ |
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
