# Sangam — Product & Engineering Blueprint

*Reference analysis, unified feature model, architecture, security, AI and
hosting for an India-hosted social + video media platform.*

---

## 1. What we are building, and an honest word on scope

Sangam is one platform that folds together three familiar media experiences:

- **Facebook-style**: a social graph, a ranked feed, groups/communities,
  text + link + photo posts, events, a marketplace.
- **Instagram-style**: a visual grid, ephemeral stories, short vertical video
  (Reels), discovery/Explore, creator profiles.
- **YouTube-style**: channels, long-form video, subscriptions, playlists,
  comments, and a recommendation surface built for watch time.

**The honest part.** Each of these is a multi-year product built by thousands
of engineers at Meta and Google. "Almost every feature of all three, at once,
solo" is not a deliverable — it is a decade. What *is* achievable, and what
this repo gives you, is a **correct foundation**: the data model, the media
pipeline, the security posture and the architecture that let you add features
one at a time without rewriting. Read this blueprint as the map, and the code
as the first few kilometres of the road.

A guiding principle: **build the boring, load-bearing things first** (identity,
storage, feed, moderation, hosting), because everything else sits on top of
them.

---

## 2. Reference analysis

### 2.1 Facebook

**Working style.** A graph-first social network. The core primitive is the
*edge* — who is connected to whom, who reacted to what. The product optimises
for breadth of connection and for keeping people inside the app (feed,
Messenger, Groups, Watch).

**Core features.**
- Profiles, friends/followers, the News Feed (ranked).
- Groups (communities), Pages (brands/creators), Events, Marketplace.
- Reels (the old Videos tab was folded into Reels in June 2025), Stories,
  Live.
- Messenger (direct messaging), reactions, comments, shares.
- Ads Manager — an unusually deep targeting and campaign system.

**Coded settings (what the product exposes as configuration).**
- Privacy: per-post audience (Public / Friends / Custom / Only me).
- Feed controls, notification controls, blocking/muting, "snooze".
- Community Standards as machine-enforced policy (automated takedown +
  appeal), which is *code*, not just a document.

**Security.** Account security (2FA, login alerts, session management),
large-scale automated content moderation, and a public *transparency* posture
after years of privacy controversies — 54% of users reported changing privacy
settings in response to those scandals. [cite:472269e1]

**Themes.** Historically a blue-and-white chrome; dark mode; dense,
information-rich layout; strong emphasis on "chrome you barely notice" so
content dominates.

**Media types.** Text, links, photos, albums, video (up to very long), Reels
(9:16, 3s–90s), Stories, Live. Facebook Reels: 1080×1920, 9:16, MP4. [cite:da677b12]

**Integrations.** Open Graph / share, Messenger platform, Business tools,
login-with (which we deliberately do **not** use).

**AI & agents.** Feed ranking (RecSys) is a graph-based execution service:
candidate retrieval → filtering → point-wise ranking → list-wise ranking →
diversity control, with privacy checks applied on the server after ranking.
[cite:6383dac5] Automated moderation, ad optimisation, and assistant/"Meta AI"
surfaces.

### 2.2 Instagram

**Working style.** Visual-first and mobile-first. Originally a Django monolith
built by a team of three, it grew into Meta's microservice infrastructure.
[cite:d58ebcb8] The product optimises for aesthetics, creators and discovery.

**Core features.** Feed grid, Stories (24h ephemeral), Reels, Explore,
Direct messaging, likes/comments/shares, profiles and following. [cite:d58ebcb8]

**Coded settings.** Account privacy (public/private), close friends, story
audience, comment controls, "not interested" signals.

**Security.** Meta's shared account-security stack; automated moderation; the
same privacy-scandal inheritance as Facebook.

**Themes.** Minimal, photo-forward, generous whitespace; dark mode; a
consistent icon and type language.

**Media types.** Photos (square 1080×1080 or 4:5 1080×1350), carousels, video
(3s–60min), Reels (9:16), Stories (9:16, 1080×1920), Live. [cite:da677b12]

**Integrations.** Facebook's Ads Manager (shared), shopping, Threads.

**AI & agents.** Explore and suggested-follows use collaborative filtering +
deep learning on interaction data. Feeds use a hybrid push/pull fan-out:
fan-out-on-write for normal accounts (< ~10K followers), fan-out-on-read for
celebrities, then an ML ranker scores ~1000 features per candidate. [cite:sysdesignwiki],[cite:d58ebcb8]

### 2.3 YouTube

**Working style.** A video platform first and a *search engine* second — it is
the world's second-most-used search destination, behind Google. [cite:f2f6d2dd]
Long shelf life: a video keeps earning for 20+ days versus hours for a social
post. [cite:f2f6d2dd]

**Core features.** Channels, uploads, subscriptions, playlists, watch page,
comments, live streaming, Shorts, and a comprehensive monetisation system
(Partner Program). [cite:4126c94c]

**Coded settings.** Video visibility (public/unlisted/private), monetisation
toggles, channel permissions, comment moderation, end screens/cards.

**Security.** Account security, copyright (Content ID-style matching), and
community-guideline enforcement.

**Themes.** 16:9 player-centric, dark "theatre" mode by default, watch-page
layout that pushes related content.

**Media types.** Long-form video (16:9; up to 12 hours / 256 GB), Shorts
(9:16 or 1:1, up to 3 minutes), Live. YouTube supports resolutions from 240p
to 8K. [cite:da677b12]

**Integrations.** Embeddable player, Google Search/SEO, ad network.

**AI & agents.** A multi-stage recommendation pipeline (retrieve → rank →
business rules) optimising watch time; automatic captions; content ID;
generative features for creators.

---

## 3. Unified feature matrix

How the three map onto one product, and where we stand. Status: ✅ in the
starter code, ⏳ on the roadmap, 💭 deliberate later/optional.

| Capability | Facebook | Instagram | YouTube | Sangam | Status |
| --- | --- | --- | --- | --- | --- |
| Account & profile | ✅ | ✅ | ✅ | Own auth + profile | ✅ |
| Social graph (follow) | friends/follow | follow | subscribe | follow (follow/accept) | ✅ |
| Ranked feed | ✅ | ✅ | ✅ | Redis fan-out + AI rank | ✅ (basic) |
| Text/photo post | ✅ | ✅ | community | ✅ | ✅ |
| Short vertical video | Reels | Reels | Shorts | SHORT type | ⏳ |
| Long-form video | Watch | IGTV (gone) | ✅ core | VIDEO type + HLS | ⏳ |
| Ephemeral stories | ✅ | ✅ | (retired) | Story model | ⏳ |
| Direct messaging | Messenger | DM | (limited) | 💭 | 💭 |
| Groups / communities | ✅ | (Threads) | community | 💭 | 💭 |
| Search & discovery | ✅ | Explore | ✅ search | ⏳ | ⏳ |
| Comments / reactions | ✅ | ✅ | ✅ | Comment/Like | ✅ (data) |
| Live streaming | ✅ | ✅ | ✅ | 💭 | 💭 |
| Monetisation | Ads | Ads/Shop | Partner | 💭 | 💭 |
| Moderation (AI) | ✅ | ✅ | ✅ | moderation service | ✅ (starter) |
| Recommendation ML | ✅ | ✅ | ✅ | ranking service | ✅ (starter) |
| Analytics for creators | ✅ | ✅ | ✅ | ⏳ | ⏳ |

---

## 4. Unified product model

Three ideas make the three experiences coexist cleanly:

1. **One identity, many surfaces.** A user is a *person* (Facebook) who is
   also a *creator* (Instagram) who also has a *channel* (YouTube). We model
   this as one `User` with role flags, not three separate accounts.
2. **One post primitive, many shapes.** A single `Post` with a `type`
   (`TEXT | IMAGE | VIDEO | SHORT`) and a `visibility` field covers feed
   posts, grid posts, Reels and channel videos. Presentation differs; storage
   and permissions do not.
3. **One feed engine, pluggable ranking.** The timeline is assembled the same
   way everywhere (fan-out + ranking). "Feed", "Explore", "Shorts" and
   "Subscriptions" are the *same* engine with different candidate sources and
   rankers.

---

## 5. Architecture (India-hosted)

**Design goal:** serve media fast to Indian users, keep all personal data in
India, and scale each layer independently.

```
 Clients (Web / Android / iOS)
        │  HTTPS
        ▼
 CDN + Edge PoPs in India (static + cached media)
        │
        ▼
 Next.js app tier  ── web UI + JSON API (auth, feed, posts, uploads)
        │
   ┌────┼─────────────┬───────────────────┐
   ▼    ▼             ▼                   ▼
Postgres  Redis     Object storage     AI service (FastAPI)
(metadata (feeds,   (MinIO/S3, India   (moderation, ranking,
 + graph) counters)  region)            enrichment)
   │
 Background workers: transcoding (FFmpeg → HLS), fan-out, counters
```

**Layers**

- **Edge/CDN.** Immutable, content-addressed media URLs cached at Indian edge
  PoPs. Only viral assets cached at the edge; long-tail served from origin
  (a two-tier cache cuts egress cost sharply). [cite:ad33beb1]
- **App tier.** Next.js serves the UI and the JSON API. Stateless, scales
  horizontally behind a load balancer.
- **Metadata store.** Postgres (shard by `user_id` when you outgrow one node;
  Vitess is the standard path). [cite:31b2ed96]
- **Social graph.** Start relational; at scale move hot edges to Redis and a
  wide-column store for the follower lists (adjacency list, sharded on
  `follower_id` and mirrored on `followee_id`). [cite:b4ab2175]
- **Feed.** Hybrid push/pull. Pre-compute timelines for normal users in Redis
  sorted sets (`feed:{userId}`, score = timestamp); pull celebrity posts at
  read time and merge. [cite:b4ab2175],[cite:sysdesignwiki] The starter code
  implements the write-side fan-out.
- **Media.** Direct-to-storage uploads via pre-signed URLs (the app tier never
  proxies bytes). [cite:31b2ed96] Transcoding is async and off the request path.
- **AI service.** Separate Python service so models can be deployed without
  touching the web tier.

**Why separate the AI service from the web app?** The web tier is I/O-bound
and wants to be boring and always-up; the AI tier is compute-heavy, changes
often, and may need GPUs. Different scaling curves, different deployment
cadence.

---

## 6. Media types & processing

| Kind | Formats | Notes |
| --- | --- | --- |
| Image | JPEG, PNG, WebP, AVIF | Generate thumbnails (150/320/640/1080px), serve WebP/AVIF with device negotiation. [cite:sysdesignwiki] |
| Short video | MP4 (H.264/H.265), 9:16 | ≤ 3 min. |
| Long video | MP4/MOV, up to 16:9 | Transcode to an ABR ladder → HLS chunks + master playlist. |
| Audio | AAC/Opus | For audio posts and music on shorts. |

**Pipeline (video):** upload → validate → queue → transcode (FFmpeg, multiple
renditions) → package HLS → generate thumbnail + preview clip → push to
object storage/CDN → mark post `READY`. Never transcode synchronously on
upload; return `PROCESSING` and let the client poll. [cite:ad33beb1],[cite:b7e9406d]

The reference specs worth matching: Facebook Reels 1080×1920 / 9:16;
Instagram video 1080×1350 / 9:16; YouTube long-form 16:9 up to 8K and Shorts
9:16 up to 3 minutes. [cite:da677b12]

---

## 7. Security & privacy (built around the DPDP Act, 2023)

The **Digital Personal Data Protection Act, 2023** applies to processing of
digital personal data within India, and to processing outside India connected
to offering services to people in India. [cite:e7f7b309] Its obligations map
directly onto infrastructure choices: [cite:3141a36c]

- **Data residency.** Cross-border transfer is currently permitted to
  un-restricted countries, but the government can restrict destinations by
  notification — so in-India hosting removes future exposure and aligns with
  policy direction. [cite:3141a36c],[cite:e7f7b309]
- **Consent & notice.** Build an explicit consent flow and a purpose-bound
  notice; keep a record of consent.
- **Right to erasure.** Personal data must be deleted once its purpose is
  fulfilled — implement real delete (storage lifecycle policies + row
  deletion), not soft-delete-forever.
- **Reasonable security safeguards.** Encryption at rest (KMS-style keys in
  the same region as the data) and in transit; least-privilege IAM; audit
  logging of access to personal data. [cite:c6146972]
- **Breach notification.** Have a documented detection + notification runbook.

**Application-level security checklist for Sangam**

- Password hashing with bcrypt/argon2 (the starter uses bcrypt, cost 12).
- Short-lived JWT sessions; server-side session records for revocation.
- Rate limiting on auth, post creation and upload endpoints.
- Signed, time-limited URLs for all media; no public buckets by default.
- Input validation with a schema library (Zod on the web tier, Pydantic in AI).
- Automated moderation on text *and* media before content is publicly visible.
- A moderation `ModerationFlag` table + human review queue for appeals.

---

## 8. AI & agents

Three concrete, buildable AI workstreams — start simple, keep the interfaces
stable:

1. **Moderation (trust & safety).** Text classifier (multilingual: English +
   Indian languages) plus a vision model over image/video frames. Output:
   `{flagged, score, categories}`. Human review queue for borderline cases.
   *Starter: heuristic pass in `apps/ai/app/moderation.py`.*
2. **Recommendation.** Multi-stage pipeline — candidate retrieval (follows,
   trending, embeddings), filtering, ranking, diversity. Optimise for
   engagement and watch time. *Starter: transparent ranker in
   `apps/ai/app/recommend.py`.*
3. **Creator agents.** Assistive agents that generate captions/alt-text,
   suggest hashtags and titles, draft descriptions, and auto-translate
   between Indian languages — high leverage, low risk, and a genuine
   differentiator for an India-first platform.

**Agents, concretely.** A moderation *agent* triages the flag queue and
escalates; a creator *agent* drafts metadata; a support *agent* answers policy
questions. Keep every agent behind the same service boundary and log its
actions for auditability.

---

## 9. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web + API | Next.js 14 (App Router), TypeScript | One language for UI and API; huge ecosystem; SSR for feed pages. |
| ORM / DB | Prisma + PostgreSQL | Typed schema, migrations, solid relational fit. |
| Cache / feed | Redis | Sorted-set timelines, counters, rate limits. |
| Object storage | S3-compatible (MinIO locally; India region in prod) | Portable, cheap, data-resident. |
| Auth | NextAuth (credentials; OTP-ready) | Own auth, no third-party dependency. |
| AI | Python + FastAPI | Where the ML ecosystem lives. |
| Video | FFmpeg → HLS | Open, standard, no vendor lock-in. |
| Containers | Docker + Compose | Reproducible dev; same images to prod. |

---

## 10. Hosting & cost in India

- **Regions:** AWS ap-south-1 (Mumbai) / ap-south-2 (Hyderabad); Indian
  providers such as **E2E Networks** (Delhi NCR & Chennai, INR billing, S3-
  compatible object storage from ~₹2.5/GB) [cite:c5564c46], **NxtGen**
  (sovereign datacentres in Bengaluru, Mumbai, Hyderabad) [cite:2eacea02], and
  **Civo's** India sovereign cloud in Mumbai [cite:3141a36c].
- **GPU (for AI/video):** entry GPUs from ~₹49/hr (NVIDIA L4); H100 from
  ~₹255.55/hr — but most AI workloads are bursty, so hourly/spot beats 24×7.
  [cite:ea46ebc4]
- **Rough starter budget:** a solo project can begin well under ₹10,000/month
  (one small VM + managed Postgres + object storage + a CDN), and scale spend
  with usage. Egress (CDN bandwidth) is usually the largest variable cost —
  hence the two-tier cache. [cite:ea46ebc4],[cite:ad33beb1]
- **MeitY empanelment** (e.g. E2E Networks) matters if you ever pursue
  government/public-sector work. [cite:c5564c46]

---

## 11. Roadmap

See [ROADMAP.md](ROADMAP.md) for the phased plan. In short: **Phase 0**
foundation (this repo) → **Phase 1** images + stories + discovery → **Phase 2**
video (transcoding, HLS, shorts) → **Phase 3** ranking ML + moderation at
scale → **Phase 4** monetisation + creators + agents.

---

## 12. Risks and hard truths

- **Scale is the hard part, not features.** The code that shows a feed is
  easy; the code that shows it to 10 million people in 200 ms is not.
- **Moderation is existential.** A platform that shows illegal or harmful
  content without controls faces legal and reputational collapse. Budget for
  it from day one.
- **Bandwidth cost.** Video egress can dwarf everything else; design caching
  and quality negotiation early.
- **Legal.** Intermediary liability, IT Rules, and DPDP obligations are real.
  This blueprint is engineering guidance, **not legal advice** — get an Indian
  lawyer before launch.
- **Solo pace.** Ship narrow, ship often. A small platform that works beats a
  big one that doesn't.
