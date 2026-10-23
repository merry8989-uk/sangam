# Sangam — pending work

Everything not yet done, pulled from `docs/ROADMAP.md` rather than from memory.
35 unchecked items, 32 after removing the ones repeated across phases.

Ordered by what it costs to leave undone, not by what is fun to build.

---

## P0 — Things that are wrong, or that lie to the user

These are not missing features. They are places where the product does something
it should not, or claims to have done something it has not.

- [ ] **The media redirect is unauthenticated.** `GET /api/media/[...key]`
      redirects anyone who has a key to the object in storage. Every post
      response carries its media keys, so a private post's media can be located
      and fetched by someone who was never meant to see it. The fix is to sign
      short-lived URLs per viewer, or to gate the route on the post's visibility.
- [ ] **Settings that are stored but never enforced.** Four of them. The user
      changes a setting, it saves, and nothing happens — which is worse than not
      offering it, because it reads as a broken product rather than an absent
      feature.
  - [ ] `whoCanComment` / `whoCanShare` / `whoCanReshare` are saved and ignored.
  - [ ] Rotating and DIY background images are saved and never applied.
  - [ ] Playback settings are saved and the player does not read them.
  - [ ] Each of these needs either the enforcement, or the control removed.
- [ ] **The `MEDIA_QUEUE_ENABLED` in-process fallback loses work.** With the
      queue off, transcoding runs in the request process, so a restart mid-encode
      leaves a post stuck in `PROCESSING` forever with no way out.

---

## P0.5 — A decision, not a task

- [ ] **Is "India-hosted" a promise to users, or a legal posture?** The app tier,
      database, cache and AI service are in Indian regions either way. Media is
      the open question: Cloudflare R2 is now a supported backend and has no
      India storage jurisdiction, so choosing it means media is not in India.
      DPDP does not require in-country storage, so the law does not decide this.
      Everything else on this list can proceed; only this one needs an answer.

---

## P1 — It has never been run

The honest one. Everything above was verified by reading, parsing and unit
tests. The stack itself has never been booted.

- [ ] **Bring the whole thing up once** with `docker compose up --build`, and
      walk the smoke test in `sangam-pc-setup-plan.pdf`. Nothing else on this
      list should be started before this.
- [ ] **Run the API against a real database.** The schema applies cleanly to a
      real PostgreSQL (41 tables, 117 indexes, 53 foreign keys) but no route has
      ever answered a real request.
- [ ] **Install the Android app on a device.** It has never rendered a screen.
      Seven runtime bugs were found by reading; there will be more.
- [ ] **Zoho WorkDrive, end to end.** The OAuth flow, `getMyFolderId`, and the
      `/files/{id}/content` download are written from documentation and have
      never run. These are the most likely to need fixing.
- [ ] **Google Drive, end to end.** Same: written from docs, never run.
- [ ] **Terabox, end to end.** Blocked until either the official API is granted
      or a decision is made to drop it.
- [ ] **The `duplex: "half"` streaming upload** for large WorkDrive files needs
      Node 18+ and a runtime that supports streaming request bodies. A serverless
      or edge deployment may buffer or reject it. Verify on the target host.

---

## P2 — Reliability and operations

- [ ] **Instrument the remaining routes.** Ten of the eighty-nine routes are
      wrapped with `withLogging` (sixteen handlers); the rest are not. Adopt it as
      each route is touched rather than in one sweep nobody can review.
- [ ] **Ship log records to an external collector.** The sink writes to Postgres.
      A production deployment usually wants a stream to a log service as well, so
      a database outage does not take the logs with it.
- [ ] **Push notifications.** Nothing reaches a phone that is not open.
- [ ] **Live DM updates on mobile.** Messages arrive only on refresh.
- [ ] **Per-link passwords and download limits** on shared drive items.

---

## P3 — Features with a clear shape

- [ ] Live streaming: RTMP ingest and HLS playback. The LiveKit backbone is
      already there for calls and meetings; this is the broadcast path.
- [ ] Recording and playback of calls and meetings.
- [ ] Waiting room enforcement and guest links for rooms.
- [ ] Share notifications, and a connect request surfacing in the notifications
      list with accept and decline inline.
- [ ] Two-way sync that mirrors WorkDrive changes back into the drive.
- [ ] WorkDrive's chunked upload above 1 GB, so a flaky connection resumes
      rather than restarts.
- [ ] **A support view over submitted reports in the UI.** Today they are read
      through the guarded internal endpoint. This moved up the list when the
      Notion mirror was removed: it is now the replacement for it rather than a
      convenience on top.
- [ ] SMTP as a mail provider, for a Gmail app password or an internal relay.
      Needs a mail library, which is why it is not done — every other provider
      works through plain `fetch`.
- [ ] Attach a screenshot with a diagnostics report.
- [ ] Let the user search their own watch and search history.
- [ ] Per-item history retention, so one entry can be kept while the rest expire.
- [ ] Per-post display overrides. The preferences are account-wide today.
- [ ] SponsorBlock-style category presets, and import/export of a skip list.
- [ ] HEVC/AV1 for 1440p and above, if the ceiling is raised again.
- [ ] Per-upload rung selection, so a creator chooses which renditions to encode.
- [ ] Zoho Notes import and export. Needs Zoho OAuth credentials.

---

## P4 — Discussed, not built

Ideas that came up and were left, with the reason.

- [ ] **A storage tier abstraction** (hot / warm / cold), so a cold tier can be
      added without touching every caller. Came out of the Terabox discussion and
      is worth doing whatever happens to Terabox.
- [ ] **A visibility lifecycle.** Changing a post from public to private should
      invalidate cached copies, not just change a flag — anyone who already
      loaded it keeps it. This is the hard half of the idea and it is independent
      of where the bytes live.
- [ ] **History with Redis in front of Postgres.** History is durable in Postgres
      today; a read-through cache would make the hot path faster without making
      it fragile.
- [ ] **A Terabox background sync.** Blocked on the official API. Without it the
      only route is scraping a session token, which this project does not do.
- [ ] **An `apps/mobile/.env.example`.** The Android app needs
      `EXPO_PUBLIC_API_URL` and there is no file telling anyone that.

---

## Quick wins

Small, self-contained, and each removes a real sharp edge.

- [ ] Remove the four settings that are stored but not enforced, until they can
      be enforced. Four small deletions, and the product stops lying.
- [ ] Add `apps/mobile/.env.example`. One file.
- [ ] Wrap the remaining job endpoints with `withLogging`. Four files.
- [ ] Add `LOG_LEVEL=DEBUG` to the local `.env.example` comment block so the
      quieter categories are discoverable.

---

## Not on this list, deliberately

- **Payments.** Never, by decision.
- **Third-party social APIs.** Facebook, Instagram and YouTube are design
  references only; there is no Meta or Google SDK, login or data dependency
  anywhere in the codebase.
- **A `.com` domain.** Not blocking. Everything can be built and tested on
  localhost and a free subdomain, and a domain is a DNS change later.
