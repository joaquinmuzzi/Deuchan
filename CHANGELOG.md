# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is 0.x,
minor versions may include breaking changes; they are always listed under **Changed** with a
note on what to update.

## [Unreleased]

### Fixed

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
