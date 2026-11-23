# Inputly

**Counts the time you spend watching the language you learn, on its own and on your computer.**

[![Tests](https://github.com/joaquinmuzzi/inputly/actions/workflows/tests.yml/badge.svg)](https://github.com/joaquinmuzzi/inputly/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Inputly is a browser extension for people who learn a language by immersion: Japanese, Spanish,
Korean, German or any other. It adds up the time you watch YouTube videos in that language, without
timers to start or stop, and shows it against a daily goal that you set, with a dashboard of your
days, weeks and months, so you can see how much input you really get.

## Why Inputly?

- **Automatic, in real time.** It counts the seconds of the clock while a video plays: pausing,
  rewinding and looping are handled, and at 2x a minute is still a minute. Two tabs playing at the
  same time count once.
- **The language you learn.** You pick it when you install Inputly, and can change it any time in the
  settings of the dashboard. The popup and the dashboard then speak of that language ("Counting
  Japanese", "Not Japanese").
- **Only that language.** It works out the language of each video and ignores the rest: from the audio
  track that plays, then the automatic captions YouTube makes from the speech, and, when there are
  none, the title and description (Chrome's built-in language detector, on your computer; German uses
  a word list of its own). When it gets one wrong, a button in the popup marks that video as in your
  language, or as not, and it is remembered, for each language apart.
- **A day that ends at 4:00.** As in Anki: what you watch after midnight counts for the evening before.
- **A day you can explain and correct.** Click a day in the dashboard to see which videos made it up
  (for the last 60 days), take out the ones that were not in your language, or say how many minutes you really
  watched.
- **An immersion profile.** In a Chrome profile you use only for the language you learn, turn it on in the settings of the
  dashboard and every video that plays with sound counts, on any site, with no guessing. So does any tab
  that plays sound for 30 seconds or more, like a podcast; a word a dictionary says does not.
- **Reading by hand.** "Count reading" in the popup counts reading with no video, like a comic, until you
  stop it or leave the computer for 15 minutes. It counts toward your goal.
- **Local and private.** The log stays in your browser. Nothing is sent anywhere unless you turn on
  "Send to Mosaik".
- **Send to Mosaik, if you use it.** Mosaik is a hub that puts together how you learn languages, on your
  own computer or on your own server. Turn on "Send to Mosaik" in the dashboard and Inputly sends it your
  time per day and what you watched and read. It talks only to the address you set: your computer
  (`127.0.0.1` or `localhost`) or your Mosaik server over https, with the device token you make in it.
  Every computer and Chrome profile sends its own time with its own token, and the dashboard and the popup
  show the total of all of them. It is off unless you turn it on. Mosaik only keeps German apart for
  now, so while the language you learn is another one, sending pauses: nothing new is sent, and the
  Mosaik panel says it is paused.

## Status

Version 0.1.0 is in review in the Chrome Web Store and in Edge Add-ons. See the [changelog](CHANGELOG.md).

The site is at <https://joaquinmuzzi.github.io/Inputly/>.

## Install from the source

- **Chrome or Edge:** open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, press
  **Load unpacked** and pick the `extension` folder.
- **Firefox (140 or later):** run `npm ci` and `npm run package:firefox`, open
  `about:debugging#/runtime/this-firefox`, press **Load Temporary Add-on** and pick
  `dist/firefox/manifest.json`. It stays until Firefox closes. See [docs/firefox.md](docs/firefox.md) for what
  differs in Firefox.

## Support

If Inputly is useful to you, you can give it a star on [GitHub](https://github.com/joaquinmuzzi/inputly)
or [support it on Ko-fi](https://ko-fi.com/muzzijoaquin).

## Privacy

The [privacy policy](PRIVACY.md) says what Inputly keeps, what leaves your browser when you turn
on "Send to Mosaik", and for how long. The text for the Chrome Web Store is in
[docs/store-listing.md](docs/store-listing.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Security problems: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
