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
- [x] Stories with 24h TTL: enforced on read, plus a sweeper job that deletes
      expired rows and their stored objects (docs/JOBS.md).
- [x] Explore page: trending posts, popular hashtags, people to follow.
- [x] Search: Meilisearch for posts and people when configured, Postgres `contains`
      otherwise; hashtags from Postgres.
- [x] Hashtag extraction on post creation + hashtag pages.

## Phase 2 - Video
- [x] Async-style transcoding worker (FFmpeg) -> ABR ladder -> HLS + poster.
- [x] /process/video endpoint; VIDEO media enriched on post creation.
- [x] HLS player component (native HLS + hls.js fallback).
- [x] Shorts surface: full-height vertical video feed.
- [x] Long-form channel pages (videos, shorts, about) + a Following feed of channel videos.
- [x] Watch page: player, channel row, description, hashtags, comments, related videos.
- [x] Preview clip generation (short muted MP4 for hover previews) + processing status polling.
- [x] Media enrichment on a Redis queue + standalone worker (apps/worker), with retries.

## Phase 3 - Ranking & trust
- [x] Multi-stage recommender: retrieval -> filter -> rank -> diversity.
- [x] Content similarity (cosine over embeddings) for related posts.
- [x] Multilingual text moderation (English + Hindi, Devanagari and romanised) with categories.
- [x] Moderation wired into post creation: flagged posts withheld + queued.
- [x] Ranked "For you" feed and a moderation review page.
- [x] Real moderation models wired in: multilingual text (XLM-R) + NSFW vision, opt-in
      via MODERATION_ENABLED; lazy-loaded with heuristic fallback and engine reporting.
- [x] GPU/ML split: API forwards to a separate inference service (ML_INFERENCE_URL);
      /infer/text and /infer/embed are the worker surface; `--profile ml` runs it.
- [x] View counters batched in Redis, flushed to Postgres by a job (docs/JOBS.md).
- [x] Analytics store: PostStat daily view rollups written by the flush job, shown
      as a 7-day trend in the creator studio.
- [x] Observability: structured JSON request logs + /metrics (AI service), /api/health (web).
- [x] Distributed tracing: W3C traceparent generated per call, propagated to the AI
      service and the worker, and logged with each request.
- [x] Error budgets: Redis-backed metrics, SLOs (AI / jobs / API), burn-rate
      evaluation, deduped alerts stored + posted to ALERT_WEBHOOK_URL, /ops page.

## Phase 4 - Creators & agents
- [x] Creator studio: post/follower/like/comment/view analytics.
- [x] Creator-assist agents: captions, hashtags, title & description, alt-text, translation seam.
- [x] App shell (navigation) and post detail page.
- [x] Groups/communities and direct messaging (built in Phase 6).
- [ ] Live streaming (RTMP ingest + HLS playback).


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
- [x] Real-time delivery over SSE (Redis pub/sub), with a slow fallback poll.
- [x] Groups / communities: create, join/leave, public + private, group-scoped posts.
- [x] Block, mute and report: feeds filter blocked/muted users; blocks stop follow + DM;
      reports land in the moderation queue.
- [x] Bookmarks / saved posts, with a /saved page.

## Phase 7 - Settings & customisation
- [x] Per-user settings model + API, and a full Settings page.
- [x] Appearance: theme, accent, background mode, daily background, DIY custom
      background, DM wallpaper.
- [x] Quality & playback: video/audio/upload quality, autoplay, speed, captions,
      PiP, background play, skip points.
- [x] Posts & media: default post visibility (enforced in the composer),
      allow downloads.
- [x] Recommended content: on/off, interests, not-interested.
- [x] Comments: Reddit-style branch view (toggleable) + sort; replies nest.
- [x] Sharing & visibility: who can comment / share / reshare / view posts,
      show-my-profile (enforced on the profile page).
- [x] Bookmarks & saving; History: record, manage, clear, auto-delete job.
- [x] Moderation: hide sensitive, blocked words (enforced on the feed).
- [x] Theme engine: 480 generated themes (10 families x 8 accents x 6 gradients),
      applied to the whole UI through CSS variables.
- [x] Rotation by day / week / month / year, or a specific theme.
- [x] Mood-driven themes: content you like, save and watch decides the family
      (melancholy -> dark, devotional -> devotion, evergreen -> nature).
- [x] /themes gallery showing every combination.
- [ ] Rotating/DIY background images are stored but not applied yet.
- [ ] Playback settings are stored; the video player does not read them yet.
- [ ] whoCanComment / whoCanShare / whoCanReshare are stored but not enforced.

## Phase 8 - Android app
- [x] Expo / React Native client in apps/mobile: feed, shorts, explore, post
      detail, messages, AI chat, settings, sign-in.
- [x] Same 480-theme engine as the web, verified to produce identical themes.
- [x] Bearer-token auth so one backend serves both clients
      (`POST /api/mobile/login`).
- [x] Inline video playback: HLS player with skip, speed, mute, audio-only,
      background play and picture-in-picture.
- [ ] Live DM updates on mobile (SSE/WebSocket client).
- [ ] Push notifications.

## Phase 9 - Custom skip points
- [x] Mark any part of a video as skippable; it is skipped on every replay.
- [x] Author chooses SELF (only their own player) or EVERYONE (anyone with
      skipping on).
- [x] Community voting with one vote per user, and segments the crowd has
      buried are hidden automatically.
- [x] Works on the web watch page and in the Android player.
- [ ] SponsorBlock-style category presets and an import/export of a user's
      own skip list.

## Phase 10 - Quality control
- [x] The transcoder now stores its rendition ladder
      (`Media.renditions`), so clients know what is available.
- [x] Web player: a quality menu backed by hls.js levels.
- [x] Android player: a quality menu that swaps the rendition playlist.
- [x] `videoQuality` / `audioQuality` act as a playback ceiling; the stricter
      of the two wins.
- [x] `uploadQuality` caps the ladder at upload time, so a "low" upload never
      stores 1080p.
- [x] Thumbnail control: the author picks the poster frame from a filmstrip of
      evenly spaced frames, on the web watch page and in the Android app.


## Cross-cutting, ongoing
- Security hardening and DPDP compliance reviews each phase.
- Load testing before every phase that adds traffic.
- Keep the AI service interfaces stable so models swap without rewrites.

## Phase 11 - Live, calling and meetings on one backbone
- [x] One `Room` model for CALL, MEETING and LIVE, backed by a self-hosted
      LiveKit server - so all three share one media path.
- [x] LiveKit access tokens minted in-process (HS256 JWT via node:crypto, no
      SDK), with per-role grants.
- [x] RTMP ingress for live, so a phone broadcaster app or OBS can push.
- [x] Rooms: create, join (with a join code), end, live start/stop.
- [x] Web `/live` and a unified `/room/[id]`; Android Live tab and room screen.
- [x] `docker compose --profile live up` starts the media server.
- [ ] Recording and playback of calls/meetings.
- [ ] Push notifications for incoming calls.
- [ ] Waiting room enforcement and guest links.

## Phase 12 - My Drive (notes and files)
- [x] One `DriveItem` tree per user: folders, uploaded files, and documents
      created in the app (note, sheet, document, slides).
- [x] Uploads accept any file type - audio, video, image, PDF, text, HTML,
      zip, epub, office documents - with a 512 MB per-file cap and a 15 GB
      per-user quota.
- [x] Pre-signed direct-to-storage uploads; the app tier never proxies bytes.
- [x] Web browser with a + menu (folder / note / sheet / document / slides /
      upload), search, and a trash.
- [x] Editors for notes and documents (markdown with a preview), sheets
      (a grid), and slides (a slide list). Files get a preview or download.
- [x] Android Drive screen with a document picker for uploads.
- [x] Reached from Settings (Notes & Drive) and the More menu.
- [ ] Sharing a drive item with other people.
- [ ] Zoho Notes import/export (needs Zoho OAuth credentials).

## Phase 13 - Navigation tidy-up
- [x] The nav bar shows eight primary destinations; the rest moved into a
      More menu.

## Phase 14 - Terabox in the drive
- [x] The drive opens with a Terabox card: create an account, connect it,
      then add share links.
- [x] A generic `LinkedAccount` model (Terabox today, reusable for others),
      with the credential encrypted at rest (AES-256-GCM) and never returned
      to a client. No password is ever asked for or stored.
- [x] Two connection paths, labelled honestly in the UI:
      - official OAuth device-code (needs credentials from the Terabox
        integration programme), and
      - the unofficial `ndus` session token, marked as advanced and unstable.
- [x] Import a share link into the drive as a `LINK` item (a pointer, not a
      copy - the bytes stay on Terabox).
- [ ] A background sync that mirrors Terabox files locally. This needs the
      official API; without it we would be scraping, which we do not do.

## Phase 15 - Zoho WorkDrive
- [x] Zoho is the primary cloud integration, because it has a real, self-serve
      OAuth 2.0 setup (register a client yourself, no approval wait) and an
      India data centre (`ZOHO_DC=in`).
- [x] Consent flow with a state cookie, then the authorization code is
      exchanged for an access token and a long-lived refresh token.
- [x] Tokens are stored encrypted; the access token is refreshed automatically
      once it nears expiry.
- [x] Create native Zoho files from the drive: `zohosheet` (Sheet),
      `zw` (Writer document) and `zohoshow` (Slides).
- [x] Upload files into WorkDrive (through our server, since WorkDrive uploads
      are token-authenticated) and list what is there.
- [x] Web and Android both offer it from the drive.
- [ ] WorkDrive's large-file stream API (>250 MB).
- [ ] Two-way sync that mirrors WorkDrive changes back into the drive.

## Parking - Drive sharing (started, not wired)
- [x] `DriveShare` model and an access resolver (`lib/drive-share.ts`), with
      the resolver unit-tested.
- [ ] The routes and UI that use them. Kept in the tree so the work is not
      lost; nothing calls it yet.
