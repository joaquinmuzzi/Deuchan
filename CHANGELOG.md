# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is 0.x,
minor versions may include breaking changes; they are always listed under **Changed** with a
note on what to update.

## [Unreleased]

### Fixed

- The dashboard drew no chart on a new install, before the first video had been watched.

### Added

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
