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
- [x] Likes and comments wired through the UI (counts, toggle, post detail page).
- [ ] Stories with 24h TTL (Redis + expiry sweeper).
- [ ] Explore/discovery page (heuristic first, then ML).
- [ ] Search (profiles + hashtags) via Postgres full-text, then Meilisearch.

## Phase 2 - Video
- [x] Async-style transcoding worker (FFmpeg) -> ABR ladder -> HLS + poster.
- [x] /process/video endpoint; VIDEO media enriched on post creation.
- [x] HLS player component (native HLS + hls.js fallback).
- [x] Shorts surface: full-height vertical video feed.
- [ ] Long-form "channel" pages + channel follows.
- [ ] Preview clip generation; processing status polling.

## Phase 3 - Ranking & trust
- [x] Multi-stage recommender: retrieval -> filter -> rank -> diversity.
- [x] Content similarity (cosine over embeddings) for related posts.
- [x] Multilingual text moderation (English + Hindi, Devanagari and romanised) with categories.
- [x] Moderation wired into post creation: flagged posts withheld + queued.
- [x] Ranked "For you" feed and a moderation review page.
- [ ] Replace heuristics with trained models (Indic text classifier, vision/NSFW).
- [ ] Counters moved to batched aggregation (Redis -> analytics store).
- [ ] Observability: metrics, tracing, error budgets.

## Phase 4 - Creators & agents
- [x] Creator studio: post/follower/like/comment/view analytics.
- [x] Creator-assist agents: captions, hashtags, title & description, alt-text, translation seam.
- [x] App shell (navigation) and post detail page.
- [ ] Groups/communities, direct messaging, live streaming.


## Phase 5 - AI chat & agents
- [x] In-app chat on Sarvam's 105B model (the model behind Indus); no login required.
- [x] Public chat endpoint with the Sarvam key held server-side only.
- [x] One agent per user (unique index), configurable: system prompt, model, skills,
      knowledge base, scheduled tasks, connectors.
- [x] Agent API: call your agent from anywhere with a Bearer key.
- [x] AI launcher button - tap to reveal options (new chat, recent chat, skills,
      knowledge base, scheduled task, connector); shows a dot when collapsed.
- [ ] Streaming responses (SSE) instead of waiting for the full reply.
- [ ] A scheduler worker to actually run the agent's scheduled tasks.
- [ ] Embeddings-based knowledge base retrieval (today the KB is injected as text).

## Cross-cutting, ongoing
- Security hardening and DPDP compliance reviews each phase.
- Load testing before every phase that adds traffic.
- Keep the AI service interfaces stable so models swap without rewrites.
