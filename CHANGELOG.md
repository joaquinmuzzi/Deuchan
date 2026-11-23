# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is 0.x,
minor versions may include breaking changes; they are always listed under **Changed** with a
note on what to update.

## [Unreleased]

### Changed

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
