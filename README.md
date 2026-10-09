# Sangam

**A homegrown, India-hosted social + video media platform** — combining the
best ideas from Facebook (social graph, groups, feed), Instagram (visual
posts, stories, reels, discovery) and YouTube (long-form video, channels,
subscriptions) into **one** product, built on our **own stack**.

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
| AI service (moderation + ranking interfaces) | ✅ (heuristic starters) |
| Image pipeline: upload -> thumbnails (WebP) -> feed | ✅ |
| Docker Compose dev stack (Postgres, Redis, MinIO) | ✅ |
| CI (lint, build, import checks) | ✅ |
| Video pipeline: FFmpeg -> ABR HLS ladder -> player -> Shorts | ✅ |
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

```bash
cp .env.example .env          # then edit secrets
docker compose up --build     # postgres, redis, minio, ai, web
```

Then open http://localhost:3000.

Running the web app directly (without Docker):

```bash
npm install
npm --workspace apps/web run db:push
npm run dev
```

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
