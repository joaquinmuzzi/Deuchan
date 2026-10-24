# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is 0.x,
minor versions may include breaking changes; they are always listed under **Changed** with a
note on what to update.

## [Unreleased]

### Added

- A browser extension that counts the time you watch German videos on YouTube. It counts real
  seconds of the clock, whatever the playback speed, and counts the time two tabs play at once only
  once. It handles pausing, rewinding and looping, decides the language of each video from its
  automatic captions (or, without them, its title and description), and keeps the log by day in
  your browser.
- A popup with today's time, the last 7 days, totals for 7 and 30 days and for all time, and your
  streak. Times show seconds, and the popup says what the current tab is doing: counting German,
  not German, paused or not on YouTube.
- A dashboard, opened from the popup: today, 7 days, 30 days, all time and the daily and monthly
  averages, an activity heatmap of the last 27 weeks, the last 7 days and the last 6 months. Light
  and dark mode, with a button to choose.
