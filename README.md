# Deuchan

**Counts the time you spend watching German on YouTube, on its own and on your computer.**

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
- **Local and private.** The log stays in your browser. Nothing is sent anywhere unless you turn on
  sync, and then only your time per day, encrypted on your computer.
- **Sync between computers, if you want it.** Turn it on in the dashboard, enter the key on your other
  computers, and they share their progress. There are no accounts: the server only holds encrypted data
  that it cannot read, and you can delete it whenever you want.

## Status

Deuchan is under development and is not published yet. See the [changelog](CHANGELOG.md).

## Support

If Deuchan is useful to you, you can give it a star on [GitHub](https://github.com/joaquinmuzzi/deuchan)
or [support it on Ko-fi](https://ko-fi.com/muzzijoaquin).

## Privacy

The [privacy policy](PRIVACY.md) says what Deuchan keeps, what leaves your browser when you turn
on sync, and for how long. The text for the Chrome Web Store is in
[docs/store-listing.md](docs/store-listing.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Security problems: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
