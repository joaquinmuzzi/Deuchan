# Plan

Where Deuchan stands and what comes next. Every session reads it at the start and updates it at the
end (see [CLAUDE.md](../CLAUDE.md#how-work-is-split-across-sessions)). Tick a task in the same pull
request that finishes it.

## Where it stands

- Works well for one user, German only, loaded unpacked. Not published anywhere.
- The store listing, the privacy policy, the screenshots and the packaging script are ready, but written
  for German only: [store-listing.md](store-listing.md), [PRIVACY.md](../PRIVACY.md), `npm run package`.
- German is assumed in many places: `extension/src/language.js` (detection), the popup and dashboard
  labels ("Not German"), the `setGerman` messages, `generic.js` (immersion profile), and
  `LANGUAGE = "de"` in `extension/src/mosaik-events.js`.

## Goal

A small product that some people pay for: first any language, then published, then real users, and
only then a paid tier. Each phase should be worth it on its own, even if the next one never happens.

## Open decisions

The maintainer decides these; the coordinating session asks when a task needs them.

- **D1. The name.** "Deuchan" says German. Keep it (a brand that started with German), or rename before
  publishing (renaming after people install it is harder). Needed before task 2.3.
- **D2. What is paid, and how it stays paid in open source code (MIT).** A check inside the extension
  can be removed by anyone. A feature that needs a server (sync between devices and browsers, history
  kept online) stays paid naturally, but costs hosting every month. Needed before phase 4.
- **D3. How money reaches the maintainer.** Stripe does not open accounts in Argentina, so ExtensionPay
  (built on Stripe) is out. Candidates with license keys: Gumroad, Lemon Squeezy, Paddle. Task 4.1
  checks which of them pay out to Argentina today.

## Phase 1: any language

The person picks the language they learn; everything that says or assumes German follows it. Existing
data stays German.

- [x] **1.1 Target language setting.** A stored setting (default `de`, so the current user notices
      nothing), chosen in the dashboard settings and asked on first run. Migrate stored data if its shape
      changes (`STORAGE_VERSION`).
- [x] **1.2 Detection for any language.** Generalize `language.js`: the audio track and the automatic
      captions already carry a language code, so they only need the target instead of `de`. The text
      fallback (title and description) uses German function words; for other languages, try
      `chrome.i18n.detectLanguage` (built into Chrome) passed in as a function so the module stays pure
      and testable. Keep the German word list if it still does better for German. Depends on 1.1.
- [x] **1.3 Labels and messages.** "Not German", "Counting German" and the like say the language's
      name, from `Intl.DisplayNames`. Rename `setGerman` and `german` in messages and state to something
      neutral (`setTarget`, `inTarget`). Depends on 1.1. Can run in parallel with 1.2 if it does not touch
      `language.js`.
- [x] **1.4 Mosaik.** Send the target language instead of the fixed `de`, or keep sending only German if
      Mosaik cannot take other languages yet (check its ingest contract). Depends on 1.1.
- [ ] **1.5 Docs.** README, CONTRIBUTING (the wrong detection issue template too) and the store listing
      speak of any language. Depends on 1.2 and 1.3.

## Phase 2: publish

- [ ] **2.1 Chrome Web Store developer account.** The maintainer creates it and pays the one-time fee
      (5 USD). Not a task for a session.
- [ ] **2.2 New screenshots** with demo data in a language other than German, plus the German ones.
      Depends on phase 1.
- [ ] **2.3 Listing and privacy review.** Update [store-listing.md](store-listing.md) and
      [PRIVACY.md](../PRIVACY.md); check each permission has a justification ready for the review.
      Depends on D1 and phase 1.
- [ ] **2.4 First release.** Version 0.1.0 (or 1.0.0) in the manifest and the changelog, then the zip
      from `npm run package`, which the maintainer uploads and submits for review.
- [ ] **2.5 Edge Add-ons.** Same package, free to publish. After 2.4.
- [ ] **2.6 Firefox.** Needs work: Firefox uses background scripts instead of a service worker, and
      some APIs differ. Investigate the gap first; only do it if users ask.

## Phase 3: users

There are no analytics by design, so the numbers come from the store dashboards (installs, weekly
users) and from what people write.

- [ ] **3.1 A simple landing page** (GitHub Pages) with what it does, the screenshots and the store link.
- [ ] **3.2 Announce it** where people count their input: r/LearnJapanese, r/languagelearning,
      r/German, the Refold community. Draft the posts in a session; the maintainer posts them.
- [ ] **3.3 Listen.** Turn feedback into issues; fix what blocks people first. Watch which features
      people ask for: that is what can be paid (D2).

## Phase 4: paid tier

Start only when the extension has about 100 weekly users, and after D2 and D3.

- [ ] **4.1 Research payments from Argentina** (D3): payout methods, fees, license key APIs. A
      research task: it ends in a short comparison added to this plan, not in code.
- [ ] **4.2 Choose the paid features and the price.** A one-time payment of about 5 to 8 USD fits a
      niche tool better than a subscription, unless the paid feature has a monthly hosting cost.
- [ ] **4.3 Build it**, with the license check, and update the privacy policy if anything new leaves
      the browser.

## Notes

Sessions add here what the next one needs to know: decisions taken, dead ends, follow-ups.

- 2026-11-23: plan written. The repository already has a CLAUDE.md for sessions; the coordinating
  session splits each phase into task sessions.
- 2026-11-23, task 1.1: the target language is kept in its own key, `targetLanguage` (a bare code such as
  `"ja"`), missing means German; no stored shape changed, so `STORAGE_VERSION` stays 1. The pure logic is
  `extension/src/target.js`: `TARGET_KEY`, `DEFAULT_TARGET` (`"de"`), `TARGET_LANGUAGES` (codes offered in
  the picker), `normalizeLanguage(tag)` (any BCP 47 tag to a bare code, or `null`: `"de-AT"` → `"de"`,
  `"iw"` → `"he"`), `targetOf(saved)` (the saved value, or `"de"`), `isTarget(tag, target)` (for
  detection: does a track's `"de-DE"` match the target), `languageName(code, locale = "en")` (via
  `Intl.DisplayNames`) and `targetOptions(saved)` (`{ code, name }` for the picker). A new install opens
  `dashboard/dashboard.html#language` (`TARGET_HASH`). For 1.2: `content.js` imports modules through
  `getURL`, so `src/target.js` has to be added to `web_accessible_resources` in the manifest when it is used
  there (`tests/manifest.test.js` checks it).
- 2026-11-23, task 1.2: `language.js` exports `detectTarget(video, { target, textLanguages })`, which returns
  `{ inTarget, reason }` (it was `detectGerman` → `{ german, reason }`; `isGermanCode` is gone, tracks are
  compared with `isTarget`). German keeps its function-word list for the text; any other target uses
  `chrome.i18n.detectLanguage`, called in `content.js` only when `needsTextLanguages(video, target)` says the
  text decides, on `videoText(video)`, and accepted when reliable with at least `MIN_TEXT_PERCENT` (40). Per-video
  overrides are kept per target under `overridesKey(target)`: `overrides` for German (unchanged, so the old
  decisions keep working), `overrides:<code>` for any other; same shape, so `STORAGE_VERSION` stays 1.
  `background.js` saves an override under the key of the target saved at that moment. For 1.3, still
  German-specific: the `setGerman` message and its `german` field (popup.js → content.js), the `override`
  and `language` messages' `german` field (content.js → background.js), `watcher.setGerman` and the `german`
  in its status (watcher.js, status shown by popup.js), `notGerman` in background.js `stepAudio`, the
  `german` state of generic.js, `germanScore`/`GERMAN_WORDS` in language.js (meant to stay: they are the
  German word list), and every label in popup.js and the dashboard.
- 2026-11-23, task 1.3: the texts take the name from `targetName(saved)` in `target.js` (the name of
  `targetOf(saved)`, "German" while nothing is saved); `describeStatus(reply, sound, language)` takes that
  name, and the popup and the dashboard follow `targetLanguage` as it changes. The vocabulary is `inTarget`:
  the popup sends `{ type: "setInTarget", inTarget }` to `content.js` and `generic.js`, which send
  `override` and `language` with an `inTarget` field; `Watcher#setInTarget` and `watcher.status.inTarget`;
  `notInTarget` in `stepAudio`; `TARGET_COLOR` in `icon.js` (was `GERMAN_COLOR`). Nothing stored changed:
  the renamed fields only travel in messages, and overrides were always `{ videoId: boolean }`, so
  `STORAGE_VERSION` stays 1. Still German on purpose: the word list in `language.js`, the default, and the
  manifest `description` (task 1.5).
- 2026-11-23, task 1.4: Mosaik's ingest takes any language tag (`^[a-z]{2,3}(-…)*$`) and stores it in
  `raw_events` and in the Deuchan `sessions`, but its `day_totals` table has no language: per device and
  day it keeps the newest `day_total` whatever its language, and the dashboard and `/api/agent/deuchan/days`
  add them all up as the German total. A day in another language would replace the German total of that
  device and day. So Deuchan only makes events while the target is in `MOSAIK_LANGUAGES` (`["de"]`, in
  `mosaik-events.js`); the builders take the language (default `"de"`) and the runner passes
  `mosaikLanguage(stored)` (the target, or `null` when paused). Paused: what is queued keeps its language and
  still goes, nothing new is queued, the days that change are marked as sent (the log has one total per day
  whatever the language, so a day with time in another language is not sent later unless it gets German time
  too), the history is not sent (`mosaikBackfilledAt` stays unset), `mosaikDays` is removed and not asked for,
  and `mosaikState.status` is `"paused"`. Follow-up for the Mosaik repository: a `language` column in
  `day_totals` (newest snapshot per device, day and language), totals filtered by its target language like
  the GSM sessions are, and `/api/agent/deuchan/days` taking a `language`; then add the languages to
  `MOSAIK_LANGUAGES` and pass the target to `fetchDays`.
