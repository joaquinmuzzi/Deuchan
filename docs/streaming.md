# Streaming sites

How Inputly counts Netflix, Crunchyroll, Prime Video and Disney+ without the immersion profile (task 2.7 of the
[plan](plan.md)): what each player says, where it was read, what was checked and what is only inferred. Read
this before changing `extension/src/streaming.js` (the readers), `extension/src/streaming-bridge.js` (the page
script), `extension/src/streaming-content.js` (the glue) or `extension/src/sites.js` (the list of sites).

## How it works

- **Off until the person turns a site on.** The dashboard settings have "Count streaming sites", one switch per
  site. Turning one on asks the browser, from that click, for `scripting` and that site's own pages
  (`sitePermissions` in `sites.js`). Both are inside what the manifest already declares as optional
  (`scripting` and `<all_urls>`, used by the immersion profile), so an update shows no new warning at install,
  and nothing about these sites is granted until the person asks for it.
- **Two scripts per site, registered by the background script** while the site is on and its access granted
  (`scheduleStreaming` in `background.js`): `streaming-bridge.js` in the page itself (world `MAIN`), because
  the players' state is not visible from a content script's isolated world, and `streaming-content.js`, which
  counts. Both start at `document_start`.
- **The bridge copies a few plain values** when asked (`inputly:streaming-request`, once a second): ids, the
  title, the playing audio and subtitle tracks, whether an ad plays. It never calls a player method that
  changes anything, never writes to the page and makes no request. Nothing is intercepted: no `fetch` or
  `JSON.parse` hook, no network manifest.
- **The readers** (`readNetflix`, `readCrunchyroll`, `readPrimeVideo`, `readDisneyPlus` in `streaming.js`) turn
  that copy into `{ key, title, audioLanguage, subtitleLanguages, ad }`. They are pure and tested
  (`tests/streaming.test.js`).
- **The audio track decides**, as on YouTube: `audioLanguage` matched against the target language
  (`streamingVerdict`). Subtitles never decide (they are often translations); they are read for the record
  only. While the player has not said which audio plays, the time waits, as on YouTube, and is dropped if it
  never says. During an ad the verdict stays the title's (the player's tracks may be the ad's) and nothing
  counts (`Watcher.setAd`).
- **The time goes to the episode or film**, as a web item (`web:<hash>` of `key`, an address such as
  `https://www.netflix.com/watch/82028220`), with its title, in the day's list and in the popup. The popup's
  "Not Japanese?" button works as on YouTube, remembered per item.
- **In the immersion profile** every title of a site turned on counts, as every YouTube video does. The
  immersion profile's own script (`generic.js`) leaves a page alone when `streaming-content.js` runs there
  (`globalThis.inputlyStreaming`, set before anything waits), so a title is not counted under two names.
- **Frames:** Crunchyroll's player (Vilos) is an iframe on `static.crunchyroll.com`. There the script only tells
  the page, by `postMessage`, whether its video plays; the page checks the message's origin against the site's
  `frames` and counts.

## Per site

| Site        | Shipped                    | Audio language from                                              | Checked                                                                 |
| ----------- | -------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Netflix     | Yes                        | The player API, `getAudioTrack().bcp47`                          | Shape from two published probes; no Netflix account here                |
| Crunchyroll | Yes                        | The web app's store, `content.media.byId[watch.id].audioLocale`  | The store read on the real site, logged out; counting through a fixture |
| Prime Video | Yes, marked "experimental" | The player's React context, `audioStream` active stream          | Shape from one open-source tool; no account here                        |
| Disney+     | Yes, marked "experimental" | `mediaPlayer.audio.selectedTrack.language` on the player element | Shape from one open-source extension; no account here                   |

Every site fails closed: when the bridge reads nothing (the player changed, a property moved), `audioLanguage` is
`null` and nothing counts; the popup says "Detecting the language…". A wrong reader can make Inputly count
nothing on a site, but not count the wrong language.

### Netflix

- **Player:** `netflix.appContext.state.playerApp.getAPI().videoPlayer`; `getAllPlayerSessionIds()` (the one
  that starts with `watch`), then `getVideoPlayerBySessionId(id)`.
- **Audio:** `getAudioTrack()` → `{ trackId, bcp47, displayName, isNative, … }`, e.g. `{ bcp47: "en",
displayName: "English [Original]", isNative: true }`. A dub has its own `bcp47`.
- **Subtitles:** `getTimedTextTrack()` → `{ bcp47, isNoneTrack, isForcedNarrative, rawTrackType, … }`.
- **Id:** `getMovieId()`, the episode or film (`/watch/<id>` in the address; the query changes, the path not).
- **Title:** `playerApp.getState().videoPlayer.videoMetadata[movieId]._metadataObject.video` → the show's
  `title`, `type` (`show` or `movie`), and its `seasons[].episodes[]` (`id`, `seq`, `title`). Fallback: the
  player's title line `[data-uia="video-title"]` (`h4` show, `span` episode number, `span` episode title).
  `document.title` is just "Netflix".
- **Ads** (plans with ads): the lead-in before a title is a separate segment; LingoFlix saw `getSegmentTime()`
  stay at 0 while `getCurrentTime()` ran through a 7007 ms lead-in, so `segmentTime === 0 && currentTime > 0` is
  read as an ad. During any ad the player shows its "Ad" label; jp343 looks for `[data-uia="ads-info-container"]`
  and `[data-uia="ads-info-text"]`, read here as `[data-uia*="ads-info"]`. Inferred: neither was seen here.
- **Navigation:** a single page app; the bridge is asked every second, a new `movieId` is a new item, and no
  player session (back to browsing) ends the item.
- **Sources:** [LingoFlix's Netflix internals](https://github.com/jaycho1214/lingoflix/blob/main/docs/netflix-internals.md)
  (verified probe output, Chrome 154, 2026-10-10, with an ad plan; the test data comes from it);
  [Read Frog's Netflix player bridge](https://github.com/mengxi-ream/read-frog/blob/main/src/entrypoints/netflix-interceptor.content/player.ts)
  (the same API path and `getAudioTrack()?.bcp47`); jp343's Netflix content script for the ad selectors.

### Crunchyroll

- **Checked on the real site** on 2026-11-23, logged out, in Argentina, in a browser pane: the watch page of One
  Piece episode 1 (`/watch/GR3VWXP96`, Japanese) and its Latin American dub (`/watch/GE00010122ES419`). The
  stream itself was blocked ("Emisión restringida"): every episode seen was `availabilityStatus: "premium_only"`,
  so nothing played.
- **Store:** the web app is React with a Redux store, reached through the props of its root (`store.getState()`);
  `watch.id` is the episode of the page, and `content.media.byId[id]` holds `audioLocale` (`"ja-JP"`,
  `"es-419"`), `title`, `parentTitle`, `episode`, `type`, `subtitleLanguages`, `audioLanguages` and `dubVersions`
  (`{ guid, audioLocale, original }` for each dub). A dub is a separate episode with its own id, so the episode
  of the page is the audio that plays. `watch.premiumDubSelectedVersion` (null here) is read as a dub picked
  inside the player; inferred from its name.
- **Title:** `parentTitle`, `episode` and `title` ("One Piece E1 - …"); `document.title` and the page's JSON-LD
  (`TVEpisode`) also name it.
- **Player:** `__APP_CONFIG__.vilosConfig.vilosPlayerUrl` is `https://static.crunchyroll.com/vilos-v2/web/vilos/player.html`,
  and jp343 runs in all frames of `*.crunchyroll.com` with code for the player's iframe, so the video is taken to
  play in that frame (asked for as `https://static.crunchyroll.com/*`). Inferred: no stream played here. The
  script also counts a `<video>` in the page itself, in case the player moves there.
- **Ads:** none detected. The media has `adBreaks` (preroll and midrolls, for free viewers), but there was no
  free episode to see how an ad shows, and premium plays none.
- **Navigation:** a single page app; `watch.id` changes with the episode.
- **Counting checked through a fixture:** Chrome 157, the extension loaded through the DevTools protocol with
  Crunchyroll turned on, and a page served at the watch address (only in that test browser) with the store
  shape captured above behind a React-like root, and a playing `<video>`: in the page, 11 s were counted under
  "One Piece E1 - …" with Spanish as target, none more with Japanese; in a `static.crunchyroll.com` iframe,
  33 s. Turning the site off took its scripts away. The real watch page could not be used there: Crunchyroll
  shows a bot check ("Un momento…") to a browser driven through the protocol.

### Prime Video

- **Player context:** the element `#dv-web-player .atvwebplayersdk-player-container`; walking its React fiber
  (`__reactFiber…`, `.return`) up to the props whose `context` or `value` has `audioStream`, `title` and
  `player`. `player.isPlayerOpen` and `player.isPlayerDestroyed` say whether it plays.
- **Audio:** `audioStream.getAudioStreamInfo().activeStream` → `{ id, language, label }`; without `language`,
  the id starts with it (`"ja-jp_dialog_0"`, as tvctl reads it).
- **Subtitles:** `captions.getCurrentCaptionsStream()` (`id: "off"` when none).
- **Title:** `title.getTitleInfo()` → `{ titleId, title }`; the episode line `.atvwebplayersdk-subtitle-text`.
  The item address is `https://www.primevideo.com/detail/<titleId>`; inferred, not opened.
- **Ads:** `adPlayback.getAdPlaybackInfo()` is set during an ad, and the timeline item that plays is not the
  title's (`contentId` not ending in `_main`), as tvctl reads them; jp343 looks for `.atvwebplayersdk-ad-timer`.
  Ads play in the same player, between parts of the title.
- **Hosts:** `www.primevideo.com` and the Amazon stores where Prime Video plays inside amazon (`.com`, `.co.uk`,
  `.de`, `.co.jp`). Other Amazon stores are not asked for: their viewers can use primevideo.com.
- **Sources:** [tvctl's Prime Video plugin](https://github.com/yusukeshib/tvctl/blob/main/plugins/primevideo/chrome.js)
  (MIT, updated 2026-11-21); jp343's Prime Video content script for the ad timer.
- **Why experimental:** one source for the language, read through React internals that Amazon can rename at any
  build; nothing was seen here.

### Disney+

- **Player:** the custom element `disney-web-player`; its own property `mediaPlayer` (an expando, visible only
  from the page's world) has `audio.selectedTrack` with `language` (a tag) and `audio.availableTracks`.
- **Id:** the play page's address, `/play/<id>`.
- **Title:** the page title without " | Disney+" (generic titles such as "Disney+" are dropped, and the item is
  named "Disney+"). Theater Mode Everywhere notes that the Open Graph title can be left over from the page
  before; the page title is used, not that.
- **Ads** (plans with ads): the player draws `ad-badge-overlay`, whose shadow root shows the time left ("0:15");
  jp343 reads it so. Theater Mode Everywhere does not detect Disney+ ads.
- **Sources:** [Theater Mode Everywhere's player contracts](https://github.com/TomaszJanusz/Theater-Mode-Everywhere/blob/main/docs/player-provider-contracts.md)
  and its [Disney+ audio bridge](https://github.com/TomaszJanusz/Theater-Mode-Everywhere/blob/main/src/providers/disney/audio-main.ts)
  (MIT, updated 2026-11-23); jp343's Disney+ content script for the ad badge.
- **Why experimental:** as Prime Video, one source for the language and nothing seen here.

## About the references

- **jp343** ([mh-343/jp343-tracker](https://github.com/mh-343/jp343-tracker)) is AGPL-3.0: it was read for what
  the players show (selectors, where the video is), and none of its code was copied. It counts what plays on
  each site and does not read the audio language.
- LingoFlix, Read Frog, tvctl and Theater Mode Everywhere were read the same way; the API paths above are facts
  about the players, written here in our own code.
- Language Reactor (closed source) and asbplayer were not studied: they work with the subtitles, and asbplayer
  takes them from the files the page downloads, an approach that would mean intercepting requests.

## Checking by hand

With an account for the site, in Chrome with the unpacked extension (or Firefox, see [firefox.md](firefox.md)):

1. Dashboard, Settings, "Count streaming sites": turn on the site and allow the access the browser asks for.
2. Open a title whose audio is in the language you learn, and play it a minute. The popup says "Counting
   <language>" with the title under it; the toolbar icon is orange.
3. Switch the audio to another language in the player's menu. Within a few seconds the popup says "Not
   <language>, not counted".
4. On a plan with ads, wait for an ad: the popup says "Ad, not counted", and the count goes on after it.
5. Dashboard, today: the title is in the day's list with about the minutes played, and opens the title.
6. Turn the site off: reload the page, the popup says "No video here".

If a step fails, run this in the page's console while it plays (it reads only, as the bridge does) and add the
answer to an issue:

```js
addEventListener(
  "message",
  (e) => e.data?.type === "inputly:streaming" && console.log(JSON.stringify(e.data)),
);
postMessage({ type: "inputly:streaming-request", site: "netflix" }, location.origin); // or crunchyroll, primevideo, disneyplus
```
