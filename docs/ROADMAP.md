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
- [x] Stories with 24h TTL (expiry enforced on read; background sweeper still TODO).
- [x] Explore page: trending posts, popular hashtags, people to follow.
- [x] Search: people, hashtags and posts (Postgres `contains`; Meilisearch still TODO).
- [x] Hashtag extraction on post creation + hashtag pages.

## Phase 2 - Video
- [x] Async-style transcoding worker (FFmpeg) -> ABR ladder -> HLS + poster.
- [x] /process/video endpoint; VIDEO media enriched on post creation.
- [x] HLS player component (native HLS + hls.js fallback).
- [x] Shorts surface: full-height vertical video feed.
- [x] Long-form channel pages (videos, shorts, about) + a Following feed of channel videos.
- [x] Watch page: player, channel row, description, hashtags, comments, related videos.
- [x] Preview clip generation (short muted MP4 for hover previews) + processing status polling.
- [ ] Move media enrichment onto a queue worker (today it runs in a background task).

## Phase 3 - Ranking & trust
- [x] Multi-stage recommender: retrieval -> filter -> rank -> diversity.
- [x] Content similarity (cosine over embeddings) for related posts.
- [x] Multilingual text moderation (English + Hindi, Devanagari and romanised) with categories.
- [x] Moderation wired into post creation: flagged posts withheld + queued.
- [x] Ranked "For you" feed and a moderation review page.
- [x] Real moderation models wired in: multilingual text (XLM-R) + NSFW vision, opt-in
      via MODERATION_ENABLED; lazy-loaded with heuristic fallback and engine reporting.
- [ ] Serve the moderation models from a dedicated (GPU) worker for throughput.
- [x] View counters batched in Redis, flushed to Postgres by a job (docs/JOBS.md).
- [ ] Move counters to an analytics store for long-term reporting.
- [x] Observability: structured JSON request logs + /metrics (AI service), /api/health (web).
- [ ] Distributed tracing and error budgets.

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
- [x] AI side bar - docked (not floating); tap to reveal options (new chat, recent
      chat, skills, knowledge base, scheduled task, connector); collapses on navigation;
      dot shown while collapsed.
- [x] Streaming responses (SSE), end to end: Sarvam -> AI service -> web -> chat UI.
- [x] Scheduler job that runs due agent tasks (docs/JOBS.md).
- [x] Embeddings-based knowledge-base retrieval: entries embedded on save, top-K
      retrieved per query (multilingual model, lexical hashing fallback).

## Phase 6 - App essentials
- [x] Notifications: created on like/comment/follow; alerts page + nav bell with unread count.
- [x] Profile settings: edit display name, bio, avatar and cover.
- [x] Delete your own post (author-only), cascading media/likes/comments/hashtags.
- [x] Avatars shown across feed, profile and channel pages.
- [x] Direct messaging: 1:1 conversations, messages list, thread view with polling,
      unread counts, and a Message button on profiles/channels.
- [ ] Real-time delivery (WebSocket/SSE) instead of 4s polling.
- [x] Groups / communities: create, join/leave, public + private, group-scoped posts.
- [x] Block, mute and report: feeds filter blocked/muted users; blocks stop follow + DM;
      reports land in the moderation queue.
- [x] Bookmarks / saved posts, with a /saved page.

## Cross-cutting, ongoing
- Security hardening and DPDP compliance reviews each phase.
- Load testing before every phase that adds traffic.
- Keep the AI service interfaces stable so models swap without rewrites.
