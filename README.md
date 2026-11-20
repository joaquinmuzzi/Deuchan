# Deuchan

**Counts the time you spend watching German, on its own and on your computer.**

[![Tests](https://github.com/joaquinmuzzi/deuchan/actions/workflows/tests.yml/badge.svg)](https://github.com/joaquinmuzzi/deuchan/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Deuchan is a browser extension for people who learn German by immersion. It adds up the time you
watch German videos on YouTube, without timers to start or stop, and shows it against a daily goal
that you set, with a dashboard of your days, weeks and months, so you can see how much input you
really get.

## Why Deuchan?

- **Automatic, in real time.** It counts the seconds of the clock while a video plays: pausing,
  rewinding and looping are handled, and at 2x a minute is still a minute. Two tabs playing at the
  same time count once.
- **Only German.** It works out the language of each video and ignores the rest. When it gets
  one wrong, a button in the popup marks that video as German, or as not German, and it is
  remembered.
- **A day you can explain and correct.** Click a day in the dashboard to see which videos made it up
  (for the last 60 days), take out the ones that were not German, or say how many minutes you really
  watched.
- **An immersion profile.** In a Chrome profile you use only for German, turn it on in the settings of the
  dashboard and every video that plays with sound counts, on any site, with no guessing. So does any tab
  that plays sound, like a podcast.
- **Reading by hand.** "Count reading" in the popup counts reading with no video, like a comic, until you
  stop it or leave the computer for 15 minutes. It counts toward your goal.
- **Local and private.** The log stays in your browser. Nothing is sent anywhere unless you turn on
  "Send to Mosaik".
- **Send to Mosaik, if you use it.** Mosaik is a hub that puts together how you learn languages, on your
  own computer or on your own server. Turn on "Send to Mosaik" in the dashboard and Deuchan sends it your
  time per day and what you watched and read. It talks only to the address you set: your computer
  (`127.0.0.1` or `localhost`) or your Mosaik server over https, with the device token you make in it.
  Every computer and Chrome profile sends its own time with its own token, and the dashboard and the popup
  show the total of all of them. It is off unless you turn it on.

## Status

Deuchan is under development and is not published yet. See the [changelog](CHANGELOG.md).

## Support

If Deuchan is useful to you, you can give it a star on [GitHub](https://github.com/joaquinmuzzi/deuchan)
or [support it on Ko-fi](https://ko-fi.com/muzzijoaquin).

## Privacy

The [privacy policy](PRIVACY.md) says what Deuchan keeps, what leaves your browser when you turn
on "Send to Mosaik", and for how long. The text for the Chrome Web Store is in
[docs/store-listing.md](docs/store-listing.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Security problems: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
