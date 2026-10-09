# Sangam - Roadmap

Narrow, sequential phases. Each phase ships something usable.

## Phase 0 - Foundation (done) [x]
- Monorepo: Next.js web + FastAPI AI service + Docker Compose.
- Own auth, profiles, follow graph.
- Posts (text/image) + feed with Redis fan-out.
- Pre-signed direct-to-storage uploads.
- Moderation + ranking service interfaces.
- CI, docs, license.

## Phase 1 - Images, stories, discovery
- [x] Image upload end-to-end: presign -> PUT -> create post -> thumbnail -> feed.
- [x] Image processing worker: validate, read dimensions, WebP thumbnails at 320/640/1080.
- [x] Feed, profile grid and post cards render thumbnails via public media URLs.
- [ ] Stories with 24h TTL (Redis + expiry sweeper).
- [ ] Explore/discovery page (heuristic first, then ML).
- [ ] Comments and likes wired through the UI.
- [ ] Search (profiles + hashtags) via Postgres full-text, then Meilisearch.

## Phase 2 - Video
- Async transcoding worker (FFmpeg) -> ABR ladder -> HLS.
- Video player component (hls.js).
- Shorts surface (9:16 vertical feed).
- Long-form "channel" pages + subscriptions.
- Thumbnail/preview generation; processing status polling.

## Phase 3 - Ranking & trust at scale
- Real moderation: multilingual text + vision models.
- Multi-stage recommender: retrieval -> rank -> diversity.
- Counters moved to batched aggregation (Redis -> analytics store).
- Observability: metrics, tracing, error budgets.

## Phase 4 - Creators, monetisation, agents
- Creator analytics dashboard.
- Creator agents: captions, alt-text, hashtags, translation.
- Monetisation primitives (subscriptions/tips) - carefully, with compliance.
- Groups/communities, direct messaging, live streaming.

## Cross-cutting, ongoing
- Security hardening and DPDP compliance reviews each phase.
- Load testing before every phase that adds traffic.
- Keep the AI service interfaces stable so models swap without rewrites.
