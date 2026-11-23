# Plan

Where Inputly stands and what comes next. Every session reads it at the start and updates it at the
end (see [CLAUDE.md](../CLAUDE.md#how-work-is-split-across-sessions)). Tick a task in the same pull
request that finishes it.

## Where it stands

- Works well for one user, loaded unpacked. Not published anywhere. Since phase 1 it counts any language.
- The store listing, the privacy policy, the screenshots and the packaging script are ready:
  [store-listing.md](store-listing.md), [PRIVACY.md](../PRIVACY.md), `npm run package`. The text speaks of
  any language, the screenshots show a Japanese learner (task 2.2), and the listing is ready to paste
  (task 2.3).
- Mosaik keeps only German apart, so sending to it pauses while the target is another language (see the
  note of task 1.4).

## Goal

A small product that some people pay for: first any language, then published, then real users, and
only then a paid tier. Each phase should be worth it on its own, even if the next one never happens.

## Competition

Checked in the Chrome Web Store on 2026-11-23. The niche is small and young: no tracker has many users.

- **jp343 "Track Your Japanese Immersion"**, the strongest: about 120 users, updated often, free with no
  paid tier (Ko-fi), open source. Tracks YouTube, Netflix, Crunchyroll, Prime Video, Disney+ and Spotify
  on its own, any other site with one click; leaves out ads; recovers a session after a crash; heatmap
  and streaks; a free optional account syncs to its site; also on Firefox. Made for Japanese, says it
  works for any language, but does not detect the language: it counts what plays.
- **Arthur · Immersion Tracker**: about 10 users. Counts all YouTube time of one YouTube account set apart
  for the language.
- Smaller or abandoned: Tracking Languages, Mikan (Firefox, Japanese), Lingo Immersion, LangMetrics, Ears
  Time. On phones, manual loggers: Lingua Logger (freemium), Vervu, TrackMyLang, Input Logger.

**What only Inputly does**, to lead the listing with: it decides the language of each video (the others
count everything, or need an account or profile used only for the language); the day ends at 4:00; each
day and each video can be corrected; the immersion profile counts any site and any sound; reading is
counted by hand; Anki statistics through Mosaik.

## Decisions taken

- **D1. The name: Inputly** (2026-11-23). "Deuchan" said German. The store name is "Inputly – Track your
  language input", and the GitHub repository is renamed to `Inputly` (GitHub redirects the old address).
  Task 1.6 does the rename.

## Open decisions

The maintainer decides these; the coordinating session asks when a task needs them.

- **D2. What is paid, and how it stays paid in open source code (MIT).** A check inside the extension
  can be removed by anyone. A feature that needs a server (sync between devices and browsers, history
  kept online) stays paid naturally, but costs hosting every month. The main competitor gives sync for
  free, so sync alone is a weak reason to pay; the paid tier needs something nobody else has, and
  statistics crossed with Anki (through Mosaik) are the best candidate. Needed before phase 4.
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
- [x] **1.5 Docs.** README, CONTRIBUTING (the wrong detection issue template too) and the store listing
      speak of any language. Depends on 1.2 and 1.3.
- [x] **1.6 Rename to Inputly** (D1). Everything a person sees: the manifest `name` and `default_title`,
      the popup and dashboard headings, page titles, README, CONTRIBUTING, PRIVACY, SECURITY, the store
      listing (name "Inputly – Track your language input"), the package name and the zip
      (`dist/inputly-<version>.zip`), and links to the repository (`joaquinmuzzi/Inputly`). Not what is
      stored or sent: storage keys stay, and the source name Mosaik knows Deuchan by stays, so history and
      Mosaik keep working. The maintainer's coordinating session renames the GitHub repository after the
      pull request is merged.

## Phase 2: publish

- [x] **2.1 Chrome Web Store developer account.** Created and paid (2026-11-23). Declared as a
      non-trader under the EEA consumer rules: the extension is free and not a business. Revisit before
      charging (phase 4), since a trader account shows a name, address, phone and email to EEA users.
- [x] **2.2 New screenshots** with demo data in a language other than German, plus the German ones.
      Depends on phase 1.
- [x] **2.3 Listing and privacy review.** Update [store-listing.md](store-listing.md) and
      [PRIVACY.md](../PRIVACY.md); check each permission has a justification ready for the review.
      Depends on D1 and phase 1.
- [ ] **2.4 First release.** Version 0.1.0 (or 1.0.0) in the manifest and the changelog, then the zip
      from `npm run package`, which the maintainer uploads and submits for review.
- [ ] **2.5 Edge Add-ons.** Same package, free to publish. After 2.4.
- [ ] **2.6 Firefox.** Needs work: Firefox uses background scripts instead of a service worker, and
      some APIs differ. Investigate the gap first. It matters more than first thought: the main competitor
      is on Firefox.

## Phase 2b: close the gap with the competition

What jp343 does and Inputly does not (see [Competition](#competition)). Worth doing before or soon after
the first release; each is its own task.

- [ ] **2.7 Streaming sites without the immersion profile.** Count Netflix, Prime Video, Crunchyroll and
      Disney+ in the target language, from the audio or subtitle track the player says is playing.
      Investigate each player first; the store review needs a reason for each new host permission.
- [ ] **2.8 Leave out ads** on YouTube (and on the sites of 2.7): time an ad plays is not input.
- [ ] **2.9 Recover after a crash.** Time counted while the browser or the service worker dies is not
      lost.
- [ ] **2.10 Narrow the optional host permissions.** Drop `https://*/*` from `optional_host_permissions`:
      `<all_urls>` covers it, and a runtime request for the one Mosaik server host stays inside a declared
      pattern. Check by hand that turning on "Send to Mosaik" with an `https://` server still asks for that
      host and sends, and update the listing table, PRIVACY.md and `tests/store.test.js` if needed. Asking
      for each site in the immersion profile instead of `<all_urls>` is the bigger step: only if a review
      asks for it (see [Review time](store-listing.md#review-time)). Small; can run before or after 2.4.

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
      the browser. Review the trader declaration of the store account first (see 2.1).

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
- 2026-11-23, task 1.5: README, CONTRIBUTING, the issue templates, the store listing and PRIVACY.md speak of
  the language the person learns. The summary (and the manifest `description`) leads with Japanese, Spanish,
  Korean and German and promises YouTube only, as detection does; the immersion profile is in the
  description. The wrong detection form asks for the target language. The screenshots and the reviewers'
  test instructions still use German (task 2.2 redoes the images). The name stays "Deuchan" (D1).
  **Phase 1 is done.** Covered by tests only, not tried by hand in Chrome: picking the language on a new
  install and in the dashboard settings, detection of a real video in another language (audio track,
  automatic captions, and `chrome.i18n.detectLanguage` on titles), the popup and dashboard labels in another
  language, overrides kept per language, and Mosaik pausing (and resuming) when the target changes. Try them
  by hand before task 2.2 takes the new screenshots.
- 2026-11-23, task 1.6: the extension is called Inputly. The manifest `name` is the store name, "Inputly – Track
  your language input" (35 of 75 characters; `tests/manifest.test.js` and `tests/store.test.js` check it and
  that the listing says the same), and `action.default_title` is "Inputly". Links point to
  `github.com/joaquinmuzzi/inputly` (GitHub ignores the case, so they work once the repository is renamed to
  `Inputly`, and the old address redirects). The package is `inputly` and the zip `dist/inputly-<version>.zip`.
  Still "deuchan" on purpose, because it is stored or sent: storage keys, alarm names (`deuchan-audio`,
  `deuchan-manual`, `deuchan-mosaik`, the legacy `deuchan-sync`), the immersion script id, the
  `deuchan:request`/`deuchan:video` page messages, `data-deuchan` and `globalThis.deuchanGeneric`, and
  everything Mosaik sees (`SOURCE = "deuchan"`, event ids, `/api/agent/deuchan/days`); the comments of the
  `mosaik-*.js` files were left alone too. The icon still draws a "D" (from Deuchan); a new icon is not done.
  Notes above this one keep the old name.
- 2026-11-23, task 2.2: the store images are Japanese, and no German one is kept (the picker in screenshot 5
  lists the other languages). Made again with `node scripts/screenshots/capture.mjs` (Chrome or Edge, found
  by itself or set with `CHROME`): it serves the repository on a local port, puts the demo storage of
  `scripts/screenshots/demo-data.mjs` and the `chrome` stand-in `chrome-stub.js` in the real extension pages,
  freezes the clock at 2026-11-20 21:40 so every run gives the same images, opens them headless through the
  DevTools protocol and writes the JPEGs to `docs/store/`. `popup-frame.html` puts the real popup beside a few
  lines of text, and `promo.html` is the small tile. Each image (page, theme, size, what is clicked) is one
  entry of `SHOTS` in `capture.mjs`; after a change to the pages, run it and look at every image. The
  dialogs are drawn at 1.25 or 1.6 device pixels per CSS pixel so they stay readable at store size (the size
  divided by it must be whole); the dashboard alone at 1. Nothing of it is packaged: `npm run package` takes only `extension/`. The icon still
  draws a "D".
- 2026-11-23, task 2.3: the listing is ready to paste ([store-listing.md](store-listing.md)): the
  description leads with what only Inputly does, the summary (and the manifest `description`) says it
  detects the language of each YouTube video, the reviewers pick English on the first-install page, the
  data usage is a checklist (web history, user activity and website content ticked, since the user data
  FAQ says data kept only on the device must be disclosed too), and "What has to be done by hand" starts
  from the existing account. PRIVACY.md has a section on the target language setting. Review: the Chrome
  Web Store review page says broad host permissions (it names `https://*/*` and `<all_urls>`) may make the
  review longer, without saying whether optional ones count; developers report the in-depth review warning
  mostly for required host permissions and content script matches. Both of Inputly's are optional and
  requested at runtime, as the docs recommend, so the first review may still be slower than a few days.
  Dropping the redundant `https://*/*` costs nothing (task 2.10); replacing `<all_urls>` would cost the
  immersion profile its "any site with no setup", so only if a review asks.
