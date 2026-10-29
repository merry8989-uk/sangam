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
- [x] Rotating/DIY background images. Applied in Phase 31, through a strict
      allowlist because the value reaches a stylesheet.
- [x] Playback settings. The player reads the speed in Phase 31.
- [x] whoCanComment / whoCanShare / whoCanReshare. Enforced in Phase 31.

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
- [x] WorkDrive large-file upload through the stream endpoint: the request
      body is piped straight through, so a multi-GB file costs the server a
      constant amount of memory. Web and Android both switch to it above
      250 MB.
- [ ] Two-way sync that mirrors WorkDrive changes back into the drive.
- [ ] WorkDrive's chunked upload for files above 1 GB (the stream path already
      handles them, but chunking resumes better on a flaky connection).

## Phase 16 - Drive sharing
- [x] Share an item with a person (view or edit) or mint a link anyone holding
      it can open, with an optional expiry.
- [x] A share on a folder covers everything inside it: the access check walks
      up the parent chain and takes the strongest share it finds.
- [x] Editors may change content; only the owner may rename, move, star,
      delete or manage sharing.
- [x] `Shared with me` list, a read-only `/share/<token>` page for link
      shares, and revoke from the share dialog.
- [x] Web and Android.
- [ ] Notifications when something is shared with you.
- [ ] Per-link passwords and download limits.

## Phase 17 - Backup
- [x] A Backup section in Settings: switch it on, choose what to include
      (chat backup, search history backup, watch history backup), how often
      (daily, weekly, monthly, half-yearly, yearly) and where it goes.
- [x] Targets: Zoho WorkDrive (preferred) and Google Drive, each through its
      own OAuth. Terabox is offered but marked as unable to receive files,
      because it has no supported way to write one.
- [x] Search history is now recorded (`SearchHistory`), so there is something
      to back up.
- [x] Each run is a plain JSON document - versioned, with the period in the
      name - so it can be read without us.
- [x] A `BackupRun` row per attempt, shown in the settings screen with its
      status, size and a link to the file.
- [x] A scheduler entry point (`/api/internal/run-backups`) that runs every
      backup that is due.
- [x] Web and Android.
- [x] The backup document is encrypted before it leaves us: AES-256-GCM, with
      a self-describing envelope so a restore knows what it is looking at.
      Either a per-user server key, or a passphrase (scrypt).
- [x] Restore: list the backups in the connected account, preview what a file
      holds, then merge it back in. Nothing is duplicated - a chat or search
      already present is skipped, and watch history upserts per post.
- [x] A backup file is treated as untrusted input: it is validated field by
      field, with hard caps, and bad entries are dropped and reported rather
      than allowed to flood the account.

## Phase 18 - Quality range set to 144p..2K
- [x] The transcoder ladder has seven rungs: 144p, 240p, 360p, 480p, 720p,
      1080p and 1440p (2K), with bitrates from 100 kbps to 10 Mbps.
- [x] H.264 profile and level rise with the resolution (main/4.1 up to 1080p,
      high/5.2 for 1440p). The branch above 4K is kept, so the ladder can be
      widened again without reintroducing the encoder refusing the frame size.
- [x] A source only gets rungs at or below its own height, so a 4K or 8K
      upload is simply capped at 1440p rather than upscaled.
- [x] Playback options run the full range; upload quality caps match (high is
      up to 2K, medium up to 1080p, original uncapped).
- [x] A saved setting from the wider range (e.g. 2160) still works: it simply
      resolves to the highest rung that exists.
- [ ] HEVC/AV1 for 1440p and above, if the ceiling is ever raised again.
- [ ] Per-upload rung selection, so a creator can choose which renditions to
      pay to encode.

## Phase 19 - The media pipeline actually run
- [x] `apps/ai/tests/e2e_pipeline.py` builds a real 1440p clip with FFmpeg,
      swaps object storage for a dict, and drives the real FastAPI app through
      TestClient. It is runnable, not a sketch: 22 checks, all passing.
- [x] Verified by decoding the output: every rendition came out at the right
      resolution and H.264 profile/level (Main/4.1 up to 1080p, High/5.2 at
      1440p), and the whole HLS master plays end to end.
- [x] Fixed a real gap the run exposed: a source missing from object storage
      raised straight through to a 500 with a stack trace. Storage reads now
      go through one helper that turns any failure into a clean 4xx.
- [x] Noted in the test why the transport stream is checked structurally: some
      static FFmpeg builds crash on the MPEG-TS demuxer, which is the tool and
      not our output.

## Phase 20 - Post display settings, from the three-dot menu
- [x] Every post now carries a three-dot menu that opens the display settings.
      It is always drawn, on purpose: it is the only way back to the settings,
      so a switch that could hide it would strand the user with no undo.
- [x] The primary interaction is a choice of three, not a fixed Follow button:
      Connect, Follow or Subscribe. Connect is the default.
- [x] Connect is a request, not a follow. It reuses the Follow row at its
      existing PENDING status, so the follow graph, the block checks and the
      notification path all keep working. Accepting connects both directions.
- [x] Subscribe is marked by a `kind` on the same row, so a channel
      subscription and a plain follow can be told apart.
- [x] Granular metadata switches: captions, like counts, comment counts, view
      counts, share counts and saved counts. Each hides only its own element.
- [x] Interface element switches: author photo, author name, timestamp, media
      badges, the primary button, and the love / comment / share / save buttons
      individually, plus button words and a compact layout.
- [x] Focus mode hides every count at once without disturbing the individual
      switches, so turning it off restores exactly what was set before.
- [x] The same settings appear in the mobile app: a bottom sheet on the post and
      a card in Settings. The web and mobile resolve rules are checked against
      each other, not just written twice.
- [x] Post gains shareCount and saveCount, which the share and save toggles need.
- [ ] Per-post overrides. These preferences are account-wide today; a post could
      carry its own exceptions.
- [ ] Share notifications, and a connect request surfacing in the notifications
      list with accept/decline inline.

## Phase 21 - History the user actually controls
- [x] Watch and search history are set separately. Wanting one and not the other
      is normal, so they are two policies, not one switch.
- [x] Four modes per type: keep, delete after a period, move to the archive
      after a period, or do not record at all.
- [x] Archived rows are kept, hidden from the main list, and restorable one at a
      time. The archive is a state on the row, not a second table, so nothing is
      copied or duplicated.
- [x] History stays in Postgres, so a restart of the process, the container, or
      the whole machine does not lose it. Cache sits in front of it for the read
      path; it is not the store of record.
- [x] Fixed a real gap: search history had no off switch at all. It was recorded
      unconditionally, and nothing ever pruned it. Both now follow the policy.
- [x] Fixed a real contradiction: the settings panel kept its own copy of the
      old `historyEnabled` and `autoDeleteDays` fields and sent them on every
      save, which could overwrite the mode the user had just chosen. Those
      fields are no longer in that panel's state.
- [x] The old fields still work. A row written before this change - including
      one with history off - resolves to the right policy, so nobody's existing
      choice is silently reversed.
- [x] Re-viewing a post brings it back out of the archive, because it is
      plainly active again.
- [ ] Let the user search their own history.
- [ ] Per-item retention, so one entry can be kept while the rest expire.

## Phase 22 - Diagnostics a user can actually send
- [x] `/diagnostics` assembles a technical report: app version, platform, route,
      device and screen, recorded errors and failed requests, and the server's
      own health checks.
- [x] Four export formats, chosen by the user: Markdown, JSON, plain text and
      CSV. CSV is one consistent table so Excel and Sheets open it without
      anything to fix - the environment details are simply rows too.
- [x] "Send to support" does three things at once so the user types nothing:
      saves the file, submits a copy, and opens their mail client with the
      subject and body already written and the filename named in the body.
- [x] Also: send without email, download, copy as Markdown, refresh, and clear.
- [x] Errors and failed requests are recorded by themselves, with no user
      action, and mirrored into storage so a reload does not lose them - the
      moment you most need the log is the moment after the page broke.
- [x] Recording is on by default and switchable off. Off clears what was held.
- [x] Redaction runs twice: once in the browser before the report is built, and
      again on the server, because anything a browser sends can be edited on the
      way. Passwords, tokens, connection strings, other people's addresses and
      phone numbers never reach the report.
- [x] The support address comes from `DIAGNOSTICS_SUPPORT_EMAIL`, not from the
      code, so a personal address is never published with the source.
- [x] The same screen on Android, sharing through the system share sheet.
- [ ] Attach the report to the email automatically. A mailto link cannot carry
      an attachment, so today the body asks the user to attach the saved file.
      Doing it properly needs a server-side mail provider.
- [ ] A support view over submitted reports in the UI. Today they are read
      through the guarded internal endpoint.

## Phase 23 - The report arrives attached
- [x] The server can email the report, with the report attached, so the user
      presses one button and is done. This is the only path that gives a real
      attachment: a mailto link and a Gmail compose URL both fill in the
      recipient, subject and body, but neither has a field for a file.
- [x] Five providers, all called with plain `fetch` so there is no mail
      dependency to install: Resend, SendGrid, Postmark, Brevo, and a `custom`
      endpoint for anything else. Each request shape is built by a pure
      function, so all of them are tested without a network.
- [x] On a phone the share sheet attaches the file itself, so Gmail opens with
      the report already on the message. Used when the server has no provider.
- [x] On desktop, Gmail compose fills in the message and the file is saved
      alongside it, with one line telling the user what to attach.
- [x] The recipient is never taken from the request - always
      `DIAGNOSTICS_SUPPORT_EMAIL` from the environment. A client-supplied
      recipient would make the endpoint an open relay for anyone to send mail
      from our domain. Rate limited per account as well.
- [x] The report is stored before the send is attempted, so a mail failure never
      loses it.
- [x] Adopted from the logging standard: the envelope is versioned
      (`schemaVersion`), carries a `sessionId`, and every entry records an
      `outcome` as well as a severity - a log full of attempts with no outcomes
      tells you someone was trying but not whether it worked.
- [x] Errors are kept at full rate and sampled events give way first when the
      buffer fills, so a burst of failures cannot grow it without bound.
- [ ] SMTP as a provider, for a Gmail app password or an internal relay. Needs a
      mail library, so it is deliberately not here yet.
- [ ] Attach a screenshot with the report.

## Phase 24 - User codes, and a log filter  (the Notion half was removed in Phase 28)
- [x] Every submitted report also becomes a row in a Notion database, so support
      sees it where they already look. The fields are database properties they
      can filter and sort on, not a wall of text: platform, app version, route,
      session, schema, event and error counts, status, and the user code.
- [x] The page body is structured too - a one-line read of the situation, then
      where it happened, the server state at the time, the errors, and the whole
      report as a JSON code block. Chunked to stay inside Notion's 100-block and
      2000-character limits, so a large report is trimmed rather than rejected.
- [x] Written with plain `fetch` against the Notion REST API, so there is no
      SDK to install and the page body can be built by a pure function and
      tested without a network. Best effort: the report is already in our own
      database, so a Notion outage never loses it or fails the request.
- [x] Every account gets a **user code** (`SG-7K2M4P`), generated once and
      stored. It is what every view sees instead of an id, a name or an email -
      the logging standard this project follows asks for a pseudonymous
      identifier and nothing else.
- [x] The alphabet follows Crockford Base32, so a code survives being read off
      a screen and typed back: `I` and `L` read as `1`, `O` reads as `0`. An
      explicit `SG-` separator is treated as intent, so `SG-7K2M` is rejected as
      too short rather than re-read as the body `SG7K2M`.
- [x] Creating a code is safe under concurrency: the unique index arbitrates,
      and the loser of a race re-reads and takes the winner's code instead of
      generating another. An existing code is never changed.
- [x] A **log filter** over the recorded events: severity, kind, outcome,
      session, a text search, and a time range. Pure, so the screen, the export,
      the email and the internal endpoint all agree on what a filter means.
- [x] The export and the email use the filter, so what is sent is what is seen,
      and a filtered report says so in its own header.
- [x] The internal endpoint filters at two levels: the list on the stored
      columns, and one report's entries in memory, so "only the errors in this
      report" costs one query rather than a scan.
- [ ] A support view over submitted reports in the UI. Today they are read
      through the guarded internal endpoint.
- [ ] Attach a screenshot with the report.

## Phase 25 - The compose carries the logs, and export stands alone
- [x] Fixed a real gating bug: "Open in Gmail" only appeared when the server had
      no mail provider, so configuring a provider removed the option entirely.
      Someone may want the report in their own Sent mail, or may simply prefer
      their own account. It is now offered whenever a support address is set, as
      "Compose in Gmail", alongside the server send rather than instead of it.
- [x] The compose body now carries the report itself, not only a summary. A
      mailto link and a Gmail compose URL cannot attach a file, so if the logs
      are to travel at all they have to travel in the body. The body holds as
      much as fits, cut on a line boundary, and says so when it was cut short -
      so the message is worth reading whether or not anything is attached.
- [x] `fitReportInBody` is the single place that decides how much goes in, and
      it is used by the mailto path, the Gmail compose path and the Android
      compose path, so all three say the same thing.
- [x] Export is now its own labelled section with its own button, rather than a
      format picker at the top and a download button buried in the actions row.
      It reads "Export MD / JSON / TXT / CSV" and says the file name it will use.
- [x] Every export format now produces **byte-identical** output on web and
      Android. Getting there surfaced three real drifts that had been there
      since the formats were written: the Android markdown was missing the
      Warnings and Filter rows, its plain-text log line was missing the outcome
      column, and it was dropping the note on a failed server check.
- [ ] Attach a screenshot with the report.
- [ ] SMTP as a mail provider, for a Gmail app password or an internal relay.

## Phase 26 - Audit, and the bugs it found
- [x] Audited the codebase rather than guessing at it: a mechanical pass over 86
      route handlers and 34 pages, then three deep reviews of the web API, the
      Android app and the schema. The mechanical pass was mostly false
      positives; the reading found the real ones.
- [x] **The public feed was publishing the bcrypt hash, the email address and
      the phone number of every post author.** `include: { author: true }`
      selects every column of the User row, and the unauthenticated feed
      returned that object verbatim. It was in twelve places, not one - the
      bookmarks list, five feed pages, the watch, saved, shorts, tag and post
      pages. All now select an explicit set.
- [x] Added `lib/select.ts`, so a column added to the schema cannot leak by
      being forgotten: nothing is selected until someone deliberately lists it.
- [x] Added `tools/check-leaks.py` and a CI job, and proved the guard fires by
      reintroducing the leak and watching it fail. A guard that has never been
      seen to fail is not a guard.
- [x] A `FOLLOWERS` post was readable by anyone who knew its id - and the id is
      in the public feed. Only `PRIVATE` was checked. Every tier is enforced now.
- [x] `GET /api/rooms/[id]` handed the join code for any room to any caller.
      The code is the invitation to a private room; it is now the host and the
      people already inside who see it, and a private room's guest list is not
      for strangers either.
- [x] `GET /api/posts/[id]/status` answered anyone who knew an id and returned
      media keys, including for a private post. Author only now.
- [x] A post or story could be created around **someone else's** media key and
      republish it: the feed exposes every key, and the new Media row would be
      owned by the poster, so every later access check passed. Keys are minted
      as `raw/<userId>/...`, and both routes now verify the prefix.
- [x] `GET /api/settings` returned the sealed backup passphrase. The PUT path
      already dropped it; the GET did not.
- [x] The feed's query params reached Prisma unchecked, so `limit=abc` or a
      stale cursor returned a 500 with a stack. Clamped and validated, and a bad
      cursor is now a 400.
- [x] **The Messages tab crashed on open.** It read `participants` and
      `updatedAt`, which `/api/dm` has never returned, so the first row threw on
      `undefined[0]`. Tapping a conversation pushed to `/post/<conversationId>`
      and got "Post not found", because there was no conversation screen at all.
      The list is fixed and `/dm/[id]` now exists, with sending.
- [x] `getToken()` was called in two upload paths and defined nowhere, so every
      WorkDrive upload threw and reported a generic failure.
- [x] `/api/drive/[id]/share` did not exist, but both the web share dialog and
      the Android drive screen called it. Every call 404'd and was swallowed, so
      the symptom was an always-empty share list. The route is written.
- [x] Three "stuck busy" bugs: the room Join button, and both drive uploads,
      cleared their busy flag after the `try` rather than in a `finally`, so an
      early return - LiveKit unconfigured, or the file picker cancelled - left
      the UI permanently disabled.
- [ ] A support view over submitted reports in the UI.
- [x] The remaining audit items. The media redirect is gated and the stuck
      transcode is recovered, both in Phase 31.

## Phase 27 - A real logging platform
- [x] Built to the logging standard: twelve categories, six severities, and one
      envelope every record carries - `ts`, `severity`, `category`, `message`,
      `appId`, `environment`, `requestId` - with sanitised metadata on top.
- [x] `lib/logger.ts` holds the taxonomy and the rules; `lib/loggerServer.ts` is
      the sink. Records are batched, the level gate is applied in the sink, and
      logging can never break the thing it is logging - every path is wrapped.
- [x] `withLogging(name, handler)` wraps a route handler and emits an API line
      per request, a SECURITY line on 401 and 403, a PERFORMANCE line when slow,
      and an ERROR line when it threw. It returns a request id on the response,
      so one number finds every line from one request across services.
      Applied to sign-in, register, upload, posts, comments, follow, likes,
      bookmarks, settings, messages and rooms.
- [x] The sign-in route had **no rate limiting at all**. Ten attempts per
      quarter hour, per address and account, so guessing is a losing game - and
      the counter is on the pair, so one attacker cannot lock out an account by
      trying from elsewhere. Every failure is a SECURITY record.
- [x] The response is the same for "no such account" and "wrong password", so
      the endpoint cannot be used to enumerate addresses. The log is not: an
      operator needs to tell those apart, and a log is not public.
- [x] `/logs` reads them back with search, filters, a live tail, and CSV, text
      or JSON export that uses the same filter as the screen. Operators only.
- [x] There was no operator check anywhere: the ops page was described as
      admin-only in a comment and nothing enforced it. `lib/admin.ts` adds one,
      and a refused attempt to read the logs is itself logged.
- [x] Retention per category, applied by `POST /api/internal/prune-logs`:
      an audit trail for a year, trace lines for three days.
- [x] Instrument the remaining routes. All 91 carry `withLogging` as of
      Phase 31, 116 distinct labels.
- [x] Ship records to an external collector. `LOG_COLLECTOR_URL` forwards each
      batch as newline-delimited JSON, off the request path. Written, never
      pointed at a real collector - that is a P2 item now.

## Phase 28 - Notion removed
- [x] The Notion mirror is gone: the library, the three call sites, the response
      fields, the panel's "Goes to" line, and the four environment variables.
      Reports live in Sangam's own database and are read through the guarded
      internal endpoint, which was always the source of truth - Notion was a
      convenience copy, so nothing is lost by removing it.
- [x] What this costs: support no longer gets a pre-built view for free. The
      support view over submitted reports moves up the pending list from
      "nice to have" to "the replacement for what was just removed".
- [x] Kept from that phase, because neither depended on Notion: the user code,
      and the log filter.
- [x] Still to do: delete the Notion database itself, which lives in the
      workspace rather than in this repository, so removing it is a click rather
      than a commit.

## Phase 29 - Cloudflare R2 as a storage backend
- [x] The storage layer was already endpoint-driven and used nothing beyond
      PutObject, GetObject, DeleteObject and a presigned URL, so R2 is a
      configuration choice rather than a code change.
- [x] `lib/storage.ts` resolves the backend from the environment - R2, AWS,
      MinIO, or any other S3-compatible endpoint - and reports whether the bytes
      leave India. The resolution is pure and covered by 42 checks.
- [x] **The honest part.** R2 has no India storage jurisdiction: the guaranteed
      ones are eu, us, fedramp and fedramp-high, and the location hints such as
      `apac` are documented as "best effort and not a guarantee". So a deployment
      on R2 is not India-hosted for media. India's DPDP Act 2023 does not require
      in-country storage - section 16(1) is a blocklist, not a residency mandate -
      so this is a promise rather than a legal constraint, and the README now says
      so instead of claiming otherwise.
- [x] `/api/health` reports the backend, the region and whether the media is in
      India, so an operator can see it rather than infer it.
- [x] Why R2 is worth it anyway: egress is free on every storage class. For a
      video platform that is the difference between a bill that scales with views
      and one that does not.
- [ ] Decide whether "India-hosted" is a promise to users or a legal posture.
      If it is a promise, media stays on an Indian backend and R2 is not used.

## Phase 30 - Analytics and crash reports as diagnostics logs
- [x] The ProGallery standard applied: one shared schema for the Android app and
      the web, so the two can be joined and compared.
- [x] `lib/events.ts` holds the catalog - 26 events across app, web and the
      user-friendliness signals - the fixed enums, the validator and the schema
      version. Pure, and covered by 50 checks.
- [x] **The rule the standard exists for.** A log showed 71 "access fix
      requested" entries and not one "fix result": it proved a user was stuck and
      could not say why. `access_fix_requested` and `access_fix_result` now share
      an `attempt_id`, and `unfinishedAttempts()` returns the pairs that never
      closed. The log screen has a panel for exactly that list.
- [x] The log envelope carries `event_name`, `schema_version`, `session_id` and
      `attempt_id`, so an analytics event and a log record are one row rather
      than two systems. The category is the class of log, the event name is the
      specific thing, and one query can ask either question.
- [x] Session context - platform, app version, os, device, network, release
      channel - is sent once with `session_start`, not repeated on every event.
- [x] Crash reporting: `crash`, `js_error` and `anr`, with the stack **hashed,
      never stored**. The hash groups occurrences; the raw stack is file paths
      that change every deploy and the likeliest place for a stray value.
- [x] The friction signals - rage click, dead click, back-button spam - are one
      event told apart by a `signal` value, so a new signal is a value rather
      than a new event.
- [x] Consent defaults to **off**, unlike diagnostics. Diagnostics is something a
      user asks for; analytics is something the product does quietly, and DPDP
      wants consent for that difference. The gate is checked inside `track`, so a
      new call site cannot forget it.
- [x] `tools/check-events.py` is the CI gate the standard asks for. It was proved
      by reintroducing a typo'd event name, a dangling enum reference and a
      non-snake_case name, and watching it fail on each.
- [x] The web half is wired: page views, Core Web Vitals, unhandled errors and
      the friction signals.
- [x] The Android half. Done in Phase 31: the catalog is mirrored with a CI gate
      against drift, and the app emits screen views, crashes and the settings
      save pair.
- [x] Ship to an external collector. Done in Phase 31, behind `LOG_COLLECTOR_URL`.

## Phase 31 - Clearing the P0 list, and the Android half
- [x] **The media route was a naked redirect.** Anyone with a key got the object,
      and every post response carries its keys - so a private post's media was
      readable by anyone who had seen the post while it was public. One rule now,
      in `lib/mediaAccess.ts`, used by the redirect and the frame and poster
      routes: the post's visibility applies, the story's audience applies, and an
      unposted upload belongs to the account the key was issued to. A denial is a
      404, because confirming that a thing exists but is not yours is itself a
      disclosure. `Media.storageKey` is indexed, which it was not.
- [x] **Four settings were stored and never enforced.** `whoCanComment`,
      `whoCanShare` and `whoCanReshare` are now read by the routes that need
      them; `backgroundMode` and `customBackground` are applied; `playbackSpeed`
      reaches the player. A setting a user changes, that saves, and that does
      nothing is worse than no setting at all - it reads as a broken product.
- [x] **The background value is user input reaching a stylesheet**, so it is
      matched against a strict allowlist rather than passed through. The gate was
      tested against fourteen injection attempts. Writing it found a real bug:
      splitting a gradient on commas broke any stop that was itself a colour
      function, so valid input was being rejected.
- [x] **The in-process transcode fallback lost work.** With
      `MEDIA_QUEUE_ENABLED` off, a restart mid-encode left a post at `PROCESSING`
      forever and the composer polling a status that would never change.
      `/api/internal/recover-transcodes` re-queues or, when there is no queue,
      marks it failed so the UI can say something true.
- [x] **The Android half of the event standard.** The catalog is mirrored into
      the app with a CI gate that fails if the two drift, and the client module
      does consent, one session, the attempt pairing, the crash handler and the
      batching. `screen_view` fires per route, and the friction signals are wired.
- [x] **Sangam's own intent/outcome pair.** `settings_save_requested` and
      `settings_save_result` share an attempt id, so a save that was sent and
      never answered is visible as exactly that - rather than as a setting that
      quietly did not stick. The reader was hardcoded to the standard's one
      example; it now reads the catalog, so a second pair cannot silently do
      nothing.
- [x] **Every route carries `withLogging`.** 91 of 91, 116 distinct labels. The
      sweep caught two of its own mistakes: an import inserted inside a multi-line
      import statement in two files, found by the parse check and repaired.
- [x] `LOG_COLLECTOR_URL` forwards each batch to an external collector as
      newline-delimited JSON, best effort and off the request path.
- [x] `apps/mobile/.env.example`, which did not exist.
- [ ] Everything in P1: the stack has still never been booted.

## Phase 32 - Anonymous chat, and an app that updates itself
- [x] **Two keys, and the difference is the feature.** The fixed key is
      permanent and a chat opened with it stays until someone deletes it. A
      temporary key is minted for one chat with a duration the user picks, ten
      seconds at the least and thirty days at the most, and when the time is up
      the chat is deleted - the rows, the files in storage, and the key.
- [x] **A temporary key binds to one chat**, so a second person using it joins
      the same chat rather than opening another. That is how a temporary group
      forms: one key, several people, all inside the same window.
- [x] **Deletion is a job, not a hope.** `POST /api/internal/expire-anon` marks a
      chat EXPIRED so a concurrent read sees the reason, deletes the storage
      objects, then deletes the rows by cascade. A failure to delete is logged as
      a security event, because a chat that outlives its expiry is the one thing
      this feature cannot do.
- [x] **Messages are write-once**, with three locks: no `updatedAt` on
      AnonMessage, no update handler under `/api/anon`, and
      `tools/check-immutable.py` in CI. The guard was proved by adding a PATCH
      route and watching it fail.
- [x] Any file type, through the existing presign path, with every attachment key
      verified against the uploader. The media gate learned about anonymous
      attachments, so a participant can read the files in a chat they are in and
      nobody else can.
- [x] Video, audio and group calls on the existing LiveKit room, with a
      per-chat pseudonym as the room identity so a call does not reveal who
      anyone is.
- [x] Web and Android screens. Both title a chat by its mode and time left,
      never by a name.
- [x] **The in-built updater.** Checks `/api/app/version` on launch, draws a real
      progress bar from the bytes written, verifies the size, and hands the file
      to Android's installer. It never replaces itself without a press. The
      version comparison is tested against the trap that catches everyone:
      `1.10` is newer than `1.9`, which a string comparison gets backwards.
- [x] **Real virtual backgrounds.** `@livekit/track-processors` at 0.8.2, with
      `BackgroundProcessor` attached in `disabled` mode as soon as the camera is
      on and switched with `switchTo` - which is what the library recommends,
      because calling `setProcessor` on every change tears the pipeline down and
      back up and you see it happen. The first version of this used
      `VirtualBackground(options)`, which is the older API that takes a string
      path, so it would have passed an object where a URL belonged; the
      documented API replaced it. Where the browser cannot run the processor the
      buttons disable themselves and say why, rather than doing nothing.
- [x] **Android attachments.** The picker takes anything, and the bytes go
      straight from the device to object storage through the same presign path
      the web uses - `FileSystem.uploadAsync` with a binary body, so the app tier
      never proxies a file.
- [x] **Android calls.** A call screen on the existing `LiveKitRoom` pattern,
      reachable from the chat, with the per-chat pseudonym as the room identity.
      Virtual backgrounds stay a web feature: the phone publishes the camera as
      it is.
