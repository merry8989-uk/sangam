# Sangam — pending work

Everything not yet done. Ordered by what it costs to leave undone, not by what is
fun to build.

Last cleared: the P0 list (media gating, the four settings that lied, the stuck
transcode), the Android half of the event standard, and the route instrumentation.

---

## P0 — A decision, not a task

- [ ] **Is "India-hosted" a promise to users, or a legal posture?** The app tier,
      database, cache and AI service are in Indian regions either way. Media is
      the open question: Cloudflare R2 is now a supported backend and has no
      India storage jurisdiction, so choosing it means media is not in India.
      DPDP does not require in-country storage - section 16(1) is a blocklist, not
      a residency mandate - so the law does not decide this. Everything else on
      this list can proceed; only this one needs an answer.

---

## P1 — It has never been run

The honest one. Everything so far was verified by reading, parsing, unit tests and
a real PostgreSQL. The stack itself has never been booted.

- [ ] **Bring the whole thing up once** with `docker compose up --build`, and walk
      the smoke test in `sangam-pc-setup-plan.pdf`. Nothing else on this list
      should be started before this.
- [ ] **Run the API against a real database.** The schema applies cleanly to a
      real PostgreSQL (41 tables, 118 indexes, 53 foreign keys) but no route has
      ever answered a real request.
- [ ] **Install the Android app on a device.** It has never rendered a screen.
      Several runtime bugs were found by reading; there will be more.
- [ ] **Test the logging on a real device and a real browser.** The standard asks
      for it, and it is the one thing that cannot be checked by reading. A log
      that never fires is worse than none.
- [ ] **Zoho WorkDrive, end to end.** The OAuth flow, `getMyFolderId`, and the
      `/files/{id}/content` download are written from documentation and have never
      run. These are the most likely to need fixing.
- [ ] **Google Drive, end to end.** Same: written from docs, never run.
- [ ] **Terabox, end to end.** Blocked until either the official API is granted or
      a decision is made to drop it.
- [ ] **The `duplex: "half"` streaming upload** for large WorkDrive files needs
      Node 18+ and a runtime that supports streaming request bodies. A serverless
      or edge deployment may buffer or reject it. Verify on the target host.
- [ ] **Media delivery performance.** The media route now resolves every key
      against the viewer, which is correct and costs a database lookup per media
      request. The production answer is a CDN with signed URLs; measure before
      and after.

---

## P2 — Reliability and operations

- [ ] **Ship logs to an external collector.** The sink writes to Postgres, and
      `LOG_COLLECTOR_URL` forwards each batch as newline-delimited JSON. Written,
      never pointed at a real collector.
- [ ] **Push notifications.** Nothing reaches a phone that is not open.
- [ ] **Live DM updates on mobile.** Messages arrive only on refresh.
- [ ] **Per-link passwords and download limits** on shared drive items.
- [ ] **A support view over submitted reports in the UI.** Today they are read
      through the guarded internal endpoint. This moved up the list when the
      Notion mirror was removed: it is now the replacement for it.

---

## P3 — Features with a clear shape

- [ ] Live streaming: RTMP ingest and HLS playback. The LiveKit backbone is
      already there for calls and meetings; this is the broadcast path.
- [ ] Recording and playback of calls and meetings.
- [ ] Waiting room enforcement and guest links for rooms.
- [ ] Share notifications, and a connect request surfacing in the notifications
      list with accept and decline inline.
- [ ] Two-way sync that mirrors WorkDrive changes back into the drive.
- [ ] WorkDrive's chunked upload above 1 GB, so a flaky connection resumes rather
      than restarts.
- [ ] SMTP as a mail provider, for a Gmail app password or an internal relay.
      Needs a mail library, which is why it is not done - every other provider
      works through plain `fetch`.
- [ ] Attach a screenshot with a diagnostics report.
- [ ] Let the user search their own watch and search history.
- [ ] Per-item history retention, so one entry can be kept while the rest expire.
- [ ] Per-post display overrides. The preferences are account-wide today.
- [ ] SponsorBlock-style category presets, and import/export of a skip list.
- [ ] HEVC/AV1 for 1440p and above, if the ceiling is raised again.
- [ ] Per-upload rung selection, so a creator chooses which renditions to encode.
- [ ] Zoho Notes import and export. Needs Zoho OAuth credentials.
- [ ] `dead_click` on Android needs a native hook; on the web it is best effort.
- [ ] The remaining app events that Sangam has no screen for yet: `anr` needs a
      native watchdog, and `media_query_result` needs the media library.

---

## P4 — Discussed, not built

Ideas that came up and were left, with the reason.

- [ ] **A storage tier abstraction** (hot / warm / cold), so a cold tier can be
      added without touching every caller.
- [ ] **A visibility lifecycle.** Changing a post from public to private should
      invalidate cached copies, not just change a flag - anyone who already loaded
      it keeps it. This is the hard half of the idea and it is independent of
      where the bytes live.
- [ ] **History with Redis in front of Postgres.** History is durable in Postgres
      today; a read-through cache would make the hot path faster without making
      it fragile.
- [ ] **A Terabox background sync.** Blocked on the official API. Without it the
      only route is scraping a session token, which this project does not do.

---

## Quick wins

- [x] `apps/mobile/.env.example` — written.
- [x] Wrap the remaining routes with `withLogging` — all 91 now carry it.
- [x] Remove or enforce the settings that lied — all four are enforced.
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
