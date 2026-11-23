# Plan

Where Inputly stands and what comes next. Every session reads it at the start and updates it at the
end (see [CLAUDE.md](../CLAUDE.md#how-work-is-split-across-sessions)). Tick a task in the same pull
request that finishes it.

## Where it stands

- Version 0.1.0 is published in the
  [Chrome Web Store](https://chromewebstore.google.com/detail/imadljjebohcpkeopadcifnodmfbndel) and in
  [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ofophfcnojdmdffnfljneagppnnjelpp) (both
  approved on 2026-11-23). Version 0.1.1 (the fixes of 2.8, 2.9 and the failed YouTube player) is
  published too. 0.2.0 (the streaming sites of 2.7) is live on Edge and was in review on Chrome on
  2026-11-23; 0.2.1 (the store name and summary of 3.4) follows it. Since phase 1 it counts any language. A Firefox build exists (task 2.6), tried in Firefox 160 and
  not yet submitted to Firefox Add-ons.
- The store listing, the privacy policy, the screenshots and the packaging script are ready:
  [store-listing.md](store-listing.md), [PRIVACY.md](../PRIVACY.md), `npm run package`. The text speaks of
  any language, the screenshots show a Japanese learner (task 2.2), and the listing is ready to paste
  (task 2.3).
- Mosaik keeps only German apart, so sending to it pauses while the target is another language (see the
  note of task 1.4).

## Goal

Real users for a tool that counts input in any language, published in the stores. Each phase should be worth
it on its own, even if the next one never happens.

## Decisions taken

- **D1. The name: Inputly** (2026-11-23). "Deuchan" said German. The store name is "Inputly – Track your
  language input", and the GitHub repository is renamed to `Inputly` (GitHub redirects the old address).
  Task 1.6 does the rename. Task 3.4 changed the store name to "Inputly – Language Immersion Tracker for
  YouTube & Netflix", for search.

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
- [x] **2.4 First release.** Version 0.1.0 (or 1.0.0) in the manifest and the changelog, then the zip
      from `npm run package`, which the maintainer uploads and submits for review. Version 0.1.0 was
      submitted for review on 2026-11-23, set to publish automatically once approved.
- [x] **2.5 Edge Add-ons.** Same package, free to publish. After 2.4. Version 0.1.0 was submitted for
      review on 2026-11-23.
- [x] **2.6 Firefox.** Needs work: Firefox uses background scripts instead of a service worker, and
      some APIs differ. Investigate the gap first. It matters more than first thought: much of the audience
      is on Firefox. Done as a second build of the same code (`npm run package:firefox`), see
      [firefox.md](firefox.md); not on Firefox Add-ons yet: the maintainer tries it in Firefox and submits it.

## Phase 2b: more ways to count

Worth doing before or soon after
the first release; each is its own task.

- [x] **2.7 Streaming sites without the immersion profile.** Count Netflix, Prime Video, Crunchyroll and
      Disney+ in the target language, from the audio or subtitle track the player says is playing.
      Investigate each player first; the store review needs a reason for each new host permission.
      Done in [streaming.md](streaming.md): all four ship, off by default, each asked for from the settings
      as an optional host inside `<all_urls>`; Prime Video and Disney+ marked experimental. What is left is a
      check by hand with real accounts (see the note of 2.7).
- [x] **2.8 Leave out ads** on YouTube (and on the sites of 2.7): time an ad plays is not input.
- [x] **2.9 Recover after a crash.** Time counted while the browser or the service worker dies is not
      lost.
- [x] **2.10 Narrow the optional host permissions.** Drop `https://*/*` from `optional_host_permissions`:
      `<all_urls>` covers it, and a runtime request for the one Mosaik server host stays inside a declared
      pattern. Check by hand that turning on "Send to Mosaik" with an `https://` server still asks for that
      host and sends, and update the listing table, PRIVACY.md and `tests/store.test.js` if needed. Asking
      for each site in the immersion profile instead of `<all_urls>` is the bigger step: only if a review
      asks for it (see [Review time](store-listing.md#review-time)). Small; can run before or after 2.4.

## Phase 3: users

There are no analytics by design, so the numbers come from the store dashboards (installs, weekly
users) and from what people write.

- [x] **3.1 A simple landing page** (GitHub Pages) with what it does, the screenshots and the store link.
      Done in `site/`, published by `.github/workflows/pages.yml` at <https://joaquinmuzzi.github.io/Inputly/>
      (Pages is switched on). Its Chrome and Edge buttons work: both stores published 0.1.0.
- [ ] **3.2 Announce it** where people count their input: r/LearnJapanese, r/languagelearning,
      r/German, the Refold community. Draft the posts in a session; the maintainer posts them.
      **Drafted** in [announce.md](announce.md); stays open until the maintainer has posted them.
      **Posted** on 2026-11-23 on the Refold forum (General) and in the Refold Discord; the r/dreamingspanish
      moderators were sent a message asking for permission to post.
- [ ] **3.3 Listen.** Turn feedback into issues; fix what blocks people first. Watch which features
      people ask for.
- [x] **3.4 Store listing for search.** A name and a summary with the words people search for (immersion,
      tracker, the sites), a description that leads with the sites and any language, a first screenshot of
      the popup on a streaming episode, and the landing page's meta and hero to match. For 0.2.1.

## Later

What comes after phase 3 is planned in the private part of the plan (see [CLAUDE.md](../CLAUDE.md)).

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
- 2026-11-23, task 2.10: `https://*/*` is out of `optional_host_permissions`; `<all_urls>` now covers the
  Mosaik server too. The code never relied on the pattern itself: the dashboard requests and the runner
  checks `hubOrigins(url)`, the exact `https://<host>/*`, and the permissions API docs allow requesting a
  subset of a declared optional origin pattern. What happens to a host granted under the old manifest is not
  documented; Chromium keeps runtime grants that intersect the new declared patterns, so it is expected to
  survive. If it does not, the runner stops at `permission-missing` (nothing is lost: events wait in the
  outbox) and the dashboard says to turn "Send to Mosaik" off and on, which asks again. Not checked by hand
  yet at the time of the pull request: see its Testing steps.
- 2026-11-23, by hand before 2.4: the maintainer updated their daily install to `main` (name Inputly, without
  `https://*/*`). History, German counting and sending to their https Mosaik server all kept working; the
  host granted under the old manifest survived the update, with no new prompt.
- 2026-11-23, task 2.4: Inputly 0.1.0 submitted to the Chrome Web Store (item `imadljjebohcpkeopadcifnodmfbndel`),
  free, public, all regions, publish automatically after review. The dashboard warned that the host
  permissions may mean an in-depth review. The store description has no Mosaik section (readers cannot
  install it); Mosaik stays in the permission justifications and PRIVACY.md.
- 2026-11-23, task 2.5: Inputly 0.1.0 submitted to Edge Add-ons (Partner Center product
  `db500bcf-ee3f-4544-ba78-b2b910026975`, Store ID `0RDCKDKZ04PB`), public, all markets; Microsoft says to
  expect an answer within 7 business days. How Edge differs from the Chrome listing: there is no Education
  category, so it is Productivity; it asks for justifications of `storage`, `alarms`, `idle` and
  `activeTab` only; the promotional tile and the screenshots must be PNG (the JPEGs of `docs/store/` were
  converted for the upload); the description says "the browser's built-in language detector" and "a
  browser profile" instead of naming Chrome. The test instructions went in "Notes for certification",
  which Edge asks for with every submission, so the next update needs them again.
- 2026-11-23, task 2.6: Firefox is a second build of the same files: only the manifest differs, made from the
  Chrome one by `scripts/firefox.mjs` (`background.scripts` instead of `service_worker`, `minimum_chrome_version`
  dropped, `browser_specific_settings.gecko` with the id `inputly@joaquinmuzzi.github.io`, `strict_min_version`
  140.0 and `data_collection_permissions: { required: ["none"] }`). `npm run package:firefox` writes
  `dist/inputly-firefox-<version>.zip` and `dist/firefox/`; `npm run lint:firefox` runs `web-ext lint` (a new
  devDependency) and CI runs it too, failing on any warning not allowed in `scripts/lint-firefox.mjs` (only the
  Firefox for Android one is). No line of the extension changed: every API it uses exists in Firefox 140 (MDN
  compat data; table in [firefox.md](firefox.md#why-firefox-140)), `chrome.*` returns promises in Firefox MV3,
  and the permission requests are already made straight from a click. 140 is set by
  `data_collection_permissions`, which AMO asks of new extensions since November 2025; the code alone needs 128.
  **Not loaded in a real Firefox** (none was installed); the first thing to do is the hand check of
  [firefox.md](firefox.md#trying-it-by-hand). Open points: (1) whether `chrome.scripting` appears in the running
  event page right after the immersion profile is granted, or only after it restarts; (2) a decision for the
  maintainer: "Send to Mosaik" goes to a server the person runs, read as no collection, so `required: ["none"]`;
  if the AMO review disagrees, declare optional `browsingActivity`, `websiteActivity`, `websiteContent` and
  request them in the Firefox build when Mosaik is turned on (see [firefox.md](firefox.md#data-collection));
  (3) Firefox for Android is not offered (YouTube there is `m.youtube.com`). AMO needs no source upload (no
  minified or generated code), although the linter's metadata flags six files as possibly minified, a false
  positive of its indentation heuristic. By hand: a Mozilla account with two-step authentication, then the
  submission ([store-listing.md](store-listing.md#firefox-add-ons-amo)). The id is fixed with the first upload.
- 2026-11-23, after 2.6: the Firefox build was tried in Firefox 160 (installed with winget), driven with
  Selenium and geckodriver `--allow-system-access` (Marionette refuses `moz-extension://` pages without it), and
  checked through `browser.storage.local`. Worked: the settings open at install; an English video counts, the
  icon turns orange and the popup says "Counting English"; a Spanish one says "Not English, not counted" and
  adds nothing; the immersion permission is asked from the click and **another site counts right after the
  grant** (open point 1 of 2.6 is settled); a tab with only sound goes from "waiting" to "counting"; "Count
  reading" counts. Found: (1) YouTube's player failed twice under automation and the video went on counting
  (fixed in content.js: `emptied`/`error` and a check every two seconds, `Watcher.sync`; the bug was in Chrome
  too); (2) the settings say "For a Chrome profile" in Firefox; (3) a 2-second sound clip in a loop counted
  only 8 of about 80 seconds, to check again with a real podcast. Not tried: "Mark as …", the day details,
  Mosaik.
- 2026-11-23, task 3.1: the landing page is `site/index.html` and `site/style.css`, plain HTML and CSS with no
  script, no web font and no request to another host (`tests/site.test.js` checks it, with the local links,
  alt text, headings, size and contrast). The images in `site/img/` are the store screenshots scaled to
  960 × 600 (`ffmpeg -vf scale=960:600 -q:v 5`), the promo tile and two icons: copy them again when
  `docs/store/` changes. The orange of the extension is too light for small text on cream, so the page uses
  a deeper orange (`#b8460a`) for links and buttons in light mode. **By hand (the maintainer):** Settings →
  Pages → Source "GitHub Actions"; until then the Pages workflow fails on `main`. Then run it once (Actions →
  Pages → Run workflow) or push a change to `site/`. The "Add to Chrome" and "Add to Edge" buttons lead to
  pages that exist only once each review passes; Firefox points to the README's install from source, to
  change to the AMO link once the add-on is listed. `homepage_url` in the manifest stays the repository.
- 2026-11-23, task 2.8: the signal is the `ad-showing` class on `#movie_player`, watched by a `MutationObserver`
  in `content.js` (and read again every two seconds), and fed to `Watcher#setAd(now, showing, playing)`: an
  ad stops the count and saves the time before it, `play` is ignored while it lasts, and when it ends the
  count goes on if the element plays. The player data was tried first and tells nothing: during a real
  pre-roll `getAdState()` said -1, and `getVideoData()` and `getPlayerResponse()` gave the video's own id
  (so the language verdict, made from that data, stays the video's, and `page-bridge.js` did not change). The
  popup says "Ad, not counted" (`reply.ad` in `describeStatus`). Checked in Chrome 157 with the unpacked
  extension loaded through CDP (`Extensions.loadUnpacked` with `--remote-debugging-pipe
--enable-unsafe-extension-debugging`, since branded Chrome ignores `--load-extension`) and English as the
  target: two pre-roll ads (15 s and 10 s) stored nothing and the video after them counted second by second;
  the same run on `main` counted a 46 s ad. A skippable ad was skipped by hand in the in-app browser: the
  class went away just before the video's `playing`. Not seen: a mid-roll (unit tests cover it, the class is
  the same) and the popup text live. Left out on purpose: the immersion profile on other sites
  (`generic.js`) has no ad detection, since no generic rule tells an ad from a video; the sites of 2.7 need
  their own rule each (their players mark ads differently), to add with each site.
- 2026-11-23, task 2.9: before, what could be lost was a `watched` message the background script had received
  but not yet written (it lived only in the single writer's promise chain); and a reading session or a sound
  stretch left open across a browser crash, a browser restart or a sleep that did not lock the screen counted
  everything up to the next alarm or Stop, up to six hours of a computer that was off. Now `delivery.js` keeps
  each `watched` message in the page until the background script answers, which it does only after the write,
  and sends it again with the next flush; a copy of time already written counts zero thanks to `covered`, so a
  message is only retried for `RESEND_SECONDS` (300, half of `KEEP_SECONDS`). `alive.js` holds the one cap,
  `MAX_SILENCE_SECONDS` (5 min, five alarm periods): longer than that since the last look and nothing ran in
  between, so `flushManual` ends the session at `lastFlushed` and `resumeSound` counts each open stretch until
  `checkedAt` (a new field of the session-storage `sound`, the log's shape did not change) and restarts it.
  `runtime.onStartup` ends a reading session left open (its tab id is gone), and a waking background script
  re-creates the reading alarm if the browser dropped it. Kept as is, and why: up to 2 s of a video (the
  flush period) and up to a minute of reading or sound before a crash (only a heartbeat more frequent than the
  alarm could tell when the browser died); `covered` and the Mosaik queue are written in the same `set` as the
  log, and Mosaik reports resent event ids as duplicates. Checked in Chrome 157 through CDP (as in 2.8): a
  YouTube video with the service worker stopped six times in 48 s counted 38.4 s of 40.5 s played (the rest
  was the last flush, not yet sent); a reading session survived a killed browser process with its minute,
  and a session made to look open for three hours counted nothing when stopped. Not exercised: the
  `onStartup` path (an extension loaded through CDP does not survive a browser restart, so it was loaded again
  instead) and the sleep path of the sound, both covered by unit tests. Follow-up: after an extension update
  or reload, a tab opened before it keeps a content script that cannot reach the extension any more and
  counts nothing until the page is reloaded; re-injecting the scripts on update needs `scripting` for YouTube.
- 2026-11-23, task 2.7: the streaming sites are registered at runtime (`scheduleStreaming` in `background.js`)
  from a per-site switch in the settings, which asks for `scripting` and that site's origins only
  (`sites.js`). Both are inside the optional `scripting` and `<all_urls>` the manifest already had, so the
  manifest only gained a `web_accessible_resources` entry and 0.2.0 shows no new warning at install; static
  content scripts would have warned every user and disabled the extension until accepted. A page script
  (`streaming-bridge.js`, world `MAIN`) copies plain values from each player and `streaming.js` reads them;
  the audio track decides, subtitles never do, and a site whose player cannot be read counts nothing (fails
  closed). Stored: a new key `streamingSites` (`{ netflix: true }`) and web items `web:<hash>` of
  `https://www.netflix.com/watch/<id>` and the like, so no stored shape changed and `STORAGE_VERSION` stays;
  `override` messages and "take out of the day" now accept web item ids too. What was seen: Crunchyroll's
  store (`content.media.byId[watch.id].audioLocale`) on the real site, logged out (every episode was premium
  only, so nothing played; no free tier with ads seen); counting was then checked in Chrome 157 with that
  store shape served at a Crunchyroll address, in the page and in a `static.crunchyroll.com` frame, because
  the real site shows a bot check to a browser driven through CDP. Netflix comes from published probe output
  (LingoFlix); Prime Video and Disney+ from one open-source tool each, hence "experimental". Not checked: any
  real playback, ads on any of the four, Firefox. Follow-ups: the maintainer's check by hand
  ([streaming.md](streaming.md#checking-by-hand)); a Crunchyroll ad rule if a free tier with ads shows up; more
  Amazon stores for Prime Video if someone asks.

- 2026-11-23, after 2.7: the maintainer checked it by hand with his own accounts, in Chrome with the
  unpacked extension: Netflix and Crunchyroll counted in the target language with the title in the popup,
  and switching the audio to another language stopped the count. Released as 0.2.0.
- 2026-11-23, task 3.2 (drafted, not posted): [announce.md](announce.md) has a checklist, the rules of each
  place, moderator messages, one draft per place (r/LearnJapanese, r/dreamingspanish, the Refold forum and
  Discord, r/languagelearning, r/German, r/Refold later), entries for two awesome-lists, ready replies and how
  to measure it. The item stays unticked until the maintainer has posted; then tick it and note where and
  when. Reddit refuses automated reading, so the rules come from Wayback Machine snapshots of each sidebar
  (2025-07 to 2026-11, linked in the file): r/LearnJapanese only in its Wednesday self-promo thread;
  r/dreamingspanish, r/languagelearning and r/German need the moderators' permission first; never r/French;
  r/Korean skipped for now. The Discord rules were not read. Every Chrome link carries its own `utm_` campaign.
  The drafts are on purpose different from each other, and the maintainer rewrites each one before posting.
  Check that the Chrome listing shows 0.2.0 before posting.
- 2026-11-23, task 3.2: the maintainer posted on the Refold forum (General) and in the Refold Discord, and sent
  the r/dreamingspanish moderators a message asking for permission to post.
- 2026-11-23, task 3.4: the name is "Inputly – Language Immersion Tracker for YouTube & Netflix" (58 of 75)
  rather than "Inputly – Input Hours Tracker for YouTube, Netflix & Crunchyroll": "immersion tracker" is the
  phrase learners and the competition use, and the shorter name stays whole in search results; Crunchyroll
  is in the summary. The summary (and the manifest `description`) is "Counts your input hours in any language
  on YouTube, Netflix and Crunchyroll. Daily goal, streak, private, no account." (117 of 132); it does not say
  "automatically", since Netflix and Crunchyroll count only once turned on. Prime Video and Disney+ stay out of
  the name, the summary and the description (named "two more streaming sites ... as experimental") while they
  are experimental, which also keeps the description at three site names; each of them appears 4 times. The
  description's privacy line says the history stays in the browser unless the Mosaik export is on. The
  screenshots are now: the popup on a made-up streaming episode (`?status=streaming` in `capture.mjs`, a
  second text in `popup-frame.html`), the day opened, the YouTube popup, the dark dashboard and the language
  picker; the light dashboard is gone, from the landing page too (`site/img/streaming.jpg` took its place).
  `capture.mjs` also writes PNG copies to `dist/subir-a-la-tienda/` for Edge. The new name and summary reach
  the stores only with the next package (0.2.1); the description and images are pasted and uploaded by hand
  with it, in both stores.
