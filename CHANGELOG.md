# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is 0.x,
minor versions may include breaking changes; they are always listed under **Changed** with a
note on what to update.

## [Unreleased]

### Fixed

- The settings panel fits the window: it scrolls inside and Save stays in sight, the data buttons keep their whole labels, every switch has the same size, and the sections sit evenly apart.

## [0.2.5] - 2026-11-26

### Added

- "Send to Kechimochi", optional and off by default: the dashboard (bars button) sends your minutes per day
  for each video, sound and reading to Kechimochi's local HTTP API (its desktop app or its web server), on this
  computer or your home network. A day that grows or is corrected updates its logs; nothing is sent twice.
- Export to CSV in the dashboard settings, in Kechimochi's Activity Logs format: one row per day and item,
  for your whole history. Any spreadsheet opens it too.
- Tabs heard in the immersion profile with no video on them (a podcast) are kept as sound, so they reach
  Kechimochi and the CSV as Listening.

### Fixed

- The button in the popup that corrects the language of a video ("Mark as Japanese", "Not Japanese?") did
  nothing when clicked. It now marks the video and remembers it.
- When reading cannot be counted on a page, the popup's message saying so now stays for a few seconds instead
  of vanishing at once.
- When YouTube plays its automatic dub in your browser's language over a video in the language you learn, the
  popup now says to pick that language's audio track in the player settings, instead of only "Not Japanese".

## [0.2.4] - 2026-11-25

### Added

- Export and import your data from the dashboard settings: "Export data" saves your history and settings to a
  JSON file, and "Import data" opens it in another browser or another install (for example, from a build loaded
  unpacked to the store build). Before anything is written it shows the days and hours in the file, and asks
  whether to replace what is here or merge both (per day, the larger time). The Mosaik token is never in the
  file.

## [0.2.3] - 2026-11-25

### Added

- A Spanish store listing: the Chrome Web Store and Edge Add-ons show Inputly's name and summary in Spanish to
  people who browse them in Spanish. The extension's pages are still in English.

## [0.2.2] - 2026-11-25

### Added

- After 10 hours counted, the popup asks once for a store rating, with "Rate Inputly" and "Not now". Either
  answer hides it for good. It is not shown in Firefox.

### Fixed

- YouTube videos for learners with uploaded captions in the language and a title that names it ("Comprehensible
  Japanese Beginner - My Morning Routine") are counted, even with no automatic captions and an English title.

## [0.2.1] - 2026-11-23

### Changed

- The store name is now "Inputly – Language Immersion Tracker for YouTube & Netflix" and the summary names
  Netflix and Crunchyroll; the toolbar button still says "Inputly". New store screenshots lead with the
  popup on a streaming episode.

## [0.2.0] - 2026-11-23

Streaming sites: Netflix, Crunchyroll, Prime Video and Disney+ count in the language you learn.

### Added

- **Streaming sites without the immersion profile.** "Count streaming sites" in the dashboard settings turns on
  Netflix, Crunchyroll, Prime Video and Disney+ (the last two experimental), each one apart, asking for access
  to that site's pages only. Inputly reads which audio track the player plays and counts the episode or film
  only when it is in your language; ads are left out where the player shows them. The popup and the day's list
  name the episode. In the immersion profile every title of a site turned on counts. See
  [docs/streaming.md](docs/streaming.md).
- The popup shows the title of the video it is counting, on YouTube too.

## [0.1.1] - 2026-11-23

Fixes that make the count more honest: ads, a failed player and crashes no longer add or lose time.

### Added

- **A Firefox build** (Firefox 140 or later, desktop): `npm run package:firefox` makes
  `dist/inputly-firefox-<version>.zip` for Firefox Add-ons from the same code, with a Firefox manifest, and
  `npm run lint:firefox` checks it with Mozilla's linter. Not on Firefox Add-ons yet. See
  [docs/firefox.md](docs/firefox.md).

### Fixed

- Time is no longer lost or invented when the browser crashes or its background script is stopped. A page
  now keeps the time it sends until the background script says it is written, and sends it again if not.
  A reading session left open by a browser that was closed or crashed, or a computer that slept, no longer
  counts the hours in between (up to six): it ends at its last counted minute. The same for the sound of a
  tab that was still playing when the computer went to sleep. At most the last minute of reading or sound
  before a crash is lost, and at most two seconds of a video.
- Ads on YouTube no longer count: YouTube plays them in the same player as the video, so a pre-roll, a
  mid-roll or a skippable ad counted as time in the language of the video. Now the count stops while an ad
  plays and goes on with the video, and the popup says "Ad, not counted". Ads on other sites of the
  immersion profile still count.
- A YouTube video no longer goes on counting after its player fails ("Something went wrong"): the player
  empties the video without saying it paused, and the time kept adding up for as long as the tab stayed open.
  Now the count stops within two seconds.

## [0.1.0] - 2026-11-23

The first version submitted to the Chrome Web Store, as Inputly.

### Changed

- **One broad permission fewer:** the optional `https://*/*` host permission is gone, since `<all_urls>`
  already covers it. "Send to Mosaik" with your own server still asks for that one host only, and a host you
  already allowed keeps working; if the browser ever asks again, the dashboard says so and turning "Send to
  Mosaik" off and on asks for it.
- **The store summary and description lead with what Inputly does differently:** it decides the language
  of each YouTube video, one click corrects it, the day ends at 4:00, the immersion profile counts any site
  and sound, and reading counts by hand. The manifest `description` says the same.
- **Deuchan is now Inputly,** since the old name said German and the extension counts any language. The
  store name is "Inputly – Track your language input", and the repository moves to
  <https://github.com/joaquinmuzzi/inputly> (the old address redirects). Your history, settings and the link
  to Mosaik keep working: nothing that is stored or sent changed.
- **YouTube videos are detected in the language you learn,** not only German: the audio track and the
  automatic captions are compared with it, and for languages other than German the title and description go
  to Chrome's built-in language detector, on your computer. German keeps its word list, and "this video is /
  is not German" decisions keep working; decisions about a video are kept for each language separately.
- **The popup and the dashboard say the name of the language you learn:** "Not Japanese", "Counting
  Japanese", "Mark as Japanese", and the note of the immersion profile. For German they read as before.
- **Sending to Mosaik pauses while the language you learn is not German.** Mosaik adds every day it gets to
  its German totals, so time in another language would end up counted as German. While the target is another
  language, nothing new is sent and the time of your other computers is not asked for; what was counted in
  German before still goes, and the Mosaik panel says it is paused. In German nothing changes.
- **The README, the store listing and the privacy policy speak of any language,** not only German. The
  privacy policy now lists the language you learn among the settings kept in your browser, and says that
  Chrome's built-in language detector may read titles and descriptions, on your computer.

- **A day ends at 4:00, not at midnight,** as in Anki and Mosaik: what is watched at 01:00 counts for the
  evening before, in the totals, the goal, the streak and the charts. The days that were already counted stay
  as they are. Update every computer, so that they all agree on the day.
- **The sync between computers is gone.** Every computer, and every Chrome profile, sends its own time
  straight to Mosaik with its own device token, and the dashboard and the popup show the total of all of
  them, as Mosaik adds it up. Nothing has to be synced by hand. When it updates, the extension deletes what
  it kept of the sync, keeps the share of each corrected day that this computer had counted, and sends its
  history to Mosaik again with only its own time. To update: make a device token for each computer in
  Mosaik (Fuentes → Dispositivos) and turn on "Send to Mosaik" with it.
- The title and the address of every video go to Mosaik, from every computer.

### Added

- The language you learn, in the settings of the dashboard (the gear button), from a list of the languages
  most learned. A new install opens the dashboard there to ask for it. It is German until you change it, so
  an update changes nothing, and for now only German is counted whatever it says: detection and labels
  follow it in the next changes.
- The immersion profile: in a Chrome profile used only for German, every video that plays with sound
  counts, on any site, with no guessing of the language. It is in the settings of the dashboard, off by
  default, and asks for the optional `scripting` permission and access to the sites.
- In the immersion profile, any tab that plays sound counts too, like a podcast or a radio, whatever plays
  it; the popup says "Counting sound". YouTube is left to its own script, and a muted tab does not count.
  A sound counts once it has lasted 30 seconds without a break, and then from its start, so that a word a
  dictionary says does not; after that, the shorter sounds of the same site in that tab count too.
- "Count reading" in the popup counts reading with no video, like a comic, on the page of the tab, until it
  is stopped, the tab is closed, or the computer is not used for 15 minutes (the time of those minutes is
  taken back). It counts toward the goal, and goes to Mosaik as reading.

- "Send to Mosaik" can send to a Mosaik server, not only to the hub on this computer: an `https://` address
  and the device token made in that server (Fuentes → Dispositivos). The browser asks for the permission
  of that one host; "Test connection" says which device the token belongs to, and a token the server does
  not take is said at once.

### Fixed

- The popup no longer shows "All your computers, with Mosaik" under the cards, where it overlapped them;
  with Mosaik on, it is said when the pointer is over the cards.
- In the dashboard, the minutes of a day follow the day until you type in them, and Save with the minutes
  untouched corrects nothing. Before, the minutes stayed as they were when the day was opened: Save after
  "Not German" put the time of the video back.
- On sites that change page without loading one (Twitch, from one channel to another), the time just
  before a change goes to the page it was watched on, and a page no longer gets the title of the one
  before: the address changes a moment before the title.
- The title of a page on another site no longer starts with the count of its unread notifications, as
  Twitch puts it in the tab: "(2) Twitch" is saved as "Twitch".
- A video with automatic dubbing was taken for German because YouTube makes automatic captions in all the
  languages of the dubbing, German among them. Now the audio track that is playing decides, so an English
  video that plays in Spanish is not counted, and one that plays in German is. Without that information
  (a video with a single audio track) the automatic captions still decide, if there is only one of them,
  then the title and the description.

- The dashboard drew no chart on a new install, before the first video had been watched.

### Added

- "Send to Mosaik", off by default: in the dashboard (the squares button), Deuchan can send what it
  counts to Mosaik, a hub on your own computer that puts together how you learn languages. It sends each
  stretch of a video (when, how long, the id and title of the video), the total of each day as the
  dashboard shows it, and the videos you take out of a day; the first time, it sends the total of every
  day of your history, and "Send history" sends it again. Only to an address on your computer
  (`127.0.0.1` or `localhost`): the extension asks for that permission when you turn it on, not at
  install. While Mosaik is not running, the events wait and go when it is back.
- Click a day in the dashboard (a square of the activity map, or a bar of the chart) to see which videos
  made it up, on this computer, for the last 60 days. "Not German" takes a video out of the day and stops
  counting it. The list is kept only on this computer and is never synced.
- Correct a day: say how many minutes you really watched. The correction is synced as its own value, so
  the day shows the same on all your computers and the old time does not come back; time counted after it
  is added on top. If you correct the same day on two computers, the last correction is the one that counts. This changes the synced data (version 2): update the extension on all your computers.
- A privacy policy (`PRIVACY.md`), the text and the images for the Chrome Web Store listing (`docs/`),
  and `npm run package`, which makes the zip to upload with only what is in `extension/`. The summary
  in the manifest says more about what the extension does, and it has a `homepage_url`.
- Optional sync between computers, off by default. Turn it on in the dashboard (the cloud button) to
  get a sync key, and enter that key on your other computers: they share their time per day and all show
  the total. The data is encrypted on your computer before it is sent, so the server cannot read it, and
  there are no accounts. You can turn sync off or delete your data from the server in the same panel.
  The extension asks for the alarms permission, to sync every few minutes, and for one address, the
  sync server.
- A small sync server (`server/`), for syncing the time between computers: it keeps one encrypted
  block for each sync key, cannot read it, and has no accounts.
- A browser extension that counts the time you watch German videos on YouTube. It counts real
  seconds of the clock, whatever the playback speed, and counts the time two tabs play at once only
  once. It handles pausing, rewinding and looping, decides the language of each video from its
  automatic captions (or, without them, its title and description), and keeps the log by day in
  your browser.
- A popup that answers how you are doing today: the time of today against the daily goal (30
  minutes until you change it), with what is left and a progress bar, what the current tab is doing
  (counting German, not German, paused or not on YouTube), your streak, your daily average and your
  last 7 days. Times show seconds. The way to the dashboard is a small link.
- A dashboard, opened from the popup: today, 7 days, 30 days, all time and the daily and monthly
  averages in six cards; an activity heatmap of the last 8 months across the whole width, a block for each month and
  a column for each week; a time per day chart you can set to 7 days, 15 days (the default),
  1 month, 3 months or 1 year (a year has 4 days in each bar), with the daily goal as a line and the
  days that reached it in green; and your average for each weekday. The page keeps a maximum width.
- A footer at the bottom of the popup and of the dashboard, with the author, a link to give the
  project a star on GitHub and a link to support it on Ko-fi.
- A button in the popup to mark the video of the tab as not German, or as German when it was
  left out by mistake. It says what the guess was, applies at once and is remembered for that video.
- An icon for the app: a D made of the little squares of the activity heatmap, white on a rounded
  square, with the PNG files of the manifest drawn by `npm run icons`.
- The toolbar icon turns orange, in the tab, while the video you are watching is in German, and is
  grey otherwise.
- The daily goal is set in the dashboard, with the gear button, as a number of minutes from 1 to 600.
- Light and dark mode with a button to choose, in warm orange, with rounded sections.
