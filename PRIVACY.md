# Privacy policy

_Last updated: 23 November 2026._

**In short:** Inputly keeps what it counts, and the language you learn, on your own computer, and sends nothing
to the internet. If you turn on "Send to Mosaik", it sends what you watched and read (the times, and the id,
title and address of each video or reading) to Mosaik, an app of yours (on your own computer, or on a server
you run), and to nowhere else. There are no accounts, no ads, no analytics and no trackers, and nothing
is sold or shared.

## Who is behind Inputly

Inputly (called Deuchan until November 2026) is a free, open-source browser extension by Joaquín Muzzi (Frodouwu). The code is in
<https://github.com/joaquinmuzzi/inputly>, so everything this policy says can be checked there.

Contact: joaquin.hola.muzzi@gmail.com, or an
[issue](https://github.com/joaquinmuzzi/inputly/issues) for anything that is not private.

## What Inputly does by default

Inputly runs on `youtube.com` pages. To count the time you watch the language you learn, it reads, **in your
browser**:

- whether the video is playing or paused;
- the language of the audio and of the captions of the video, and its title and description, only to decide
  whether it is in the language you learn. For a language other than German, the title and description may
  go to the browser's built-in language detector (Chrome's, or Firefox's in Firefox), which works on your computer. The description is not stored. The title is kept only in the list of videos
  described below. Nothing is sent anywhere.

It stores on your computer (in `chrome.storage.local`):

- the **seconds you watched per day** (a date and a number);
- the **videos and readings that made up each of the last 60 days**: the id, the title and the address of
  each one and the seconds of it, so that you can see what a day was made of and correct it (with "Send to
  Mosaik" on, it goes to your Mosaik: [see below](#what-happens-when-you-turn-on-send-to-mosaik));
- the **corrections** you make to a day (a number of seconds, and when you made it);
- your **daily goal** and your settings (the language you learn, light or dark, the range of the chart, the
  immersion profile);
- the **ids of the videos you marked** as in the language you learn or not, for each language, so the
  decision is remembered;
- only if you turn on "Send to Mosaik": its settings (with the device token, if your Mosaik is on a
  server), the events that wait to be sent to it, and the totals per day it answers with.

All of this stays in your browser. It is deleted when you uninstall the extension, and you can look at it
in the dashboard. Inputly does not read your YouTube account, your history, your searches or your
recommendations.

## The language you learn

When Inputly is installed, it asks which language you learn (the target language setting), and you can change
it any time in the dashboard settings. It is kept on your computer as a language code (such as `ja`), with
your other settings, and decides which videos count. It is not sent anywhere, except that every item sent to
your Mosaik, if you turn that on, says the language it was counted in (see below).

## The immersion profile

The immersion profile is **optional and off by default**, and is set for each Chrome profile apart. It is for a
Chrome profile you use only for the language you learn: every video that plays with sound counts, on any site, without guessing
its language. When you turn it on in the dashboard settings, your browser asks you for two permissions:
`scripting`, and access to the sites you visit. Then Inputly:

- runs a small script in every page you open in that profile, which only looks for videos and whether they
  play, with sound;
- counts the time a tab plays sound (a podcast, for example), as Chrome tells extensions whether a tab is
  playing sound, and whether it is muted. A sound counts once it has lasted 30 seconds; until then, its page
  is kept only in memory, and forgotten if the sound ends before;
- keeps, for a page where a video or sound played, its address, its title and the seconds, in the list of
  the day above. Pages where nothing played are not recorded.

Turning it off stops the script. The permissions stay granted until you remove them in `chrome://extensions`.

## Reading counted by hand

The popup has a button to count reading with no video (a comic, for example). While it runs, Inputly counts the
time and keeps the address and the title of the tab where you started it, as above. It uses the `idle`
permission to stop when nobody has used the computer for 15 minutes; that permission tells Inputly only
whether the computer is in use, nothing about what you do.

## What happens when you turn on Send to Mosaik

"Send to Mosaik" is **optional and off by default**. Mosaik is a separate app, by the same author, that puts
together how you learn languages (Anki, games, videos). It runs on your own computer, or on a server you
set up yourself so that several of your computers can send to it. If you use it, you can turn this on in the
dashboard (the squares button). Then:

- You set the address of your Mosaik: on this computer, `http://127.0.0.1` or `http://localhost` on any
  port (`http://127.0.0.1:7300` unless you change it); or your own Mosaik server, an `https://` address.
  A plain `http://` address of another computer is refused, so nothing travels unencrypted.
- A Mosaik server only takes data with a **device token** that you make in that server (Fuentes →
  Dispositivos) and paste in Inputly. It is kept only in this browser and sent only to that address, with
  every request. You can revoke it in the server at any time.
- Your browser asks you for the permission to reach that one address; without it, nothing is sent.
- Every minute, Inputly sends Mosaik, each item with the language it was counted in:
  - each **stretch of a video or a reading**: when it started and ended, the seconds counted, and the id, the
    title and the address of what it was;
  - the **total of each day on this computer**, with the videos and readings of that day (id, title,
    address, seconds). The first time you turn it on, it sends the total of every day in your history;
  - when you **take a video out of a day**: the day, the id of the video, and when.
- Every few minutes, and when you open the popup or the dashboard, it asks Mosaik for the **totals of every
  computer** that sends to it, so that it can show the time of all of them. That answer is kept in your
  browser.
- Mosaik only counts German for now: while the language you learn is another one, nothing new is sent and
  nothing is asked for (what was counted in German before still goes).
- All of it goes only to the address you set: not to the developer and not to anyone else. What Mosaik
  does with it is up to your Mosaik. If it is a server, it is yours: the developer of Inputly does not run
  it and has no access to it, and whoever hosts it (for example, Railway) keeps it, and the IP address of
  each request, under their own terms.
- While Mosaik is not running, what is to be sent waits in your browser (at most about 5000 events; if there
  are more, the oldest stretches go first) and is sent when Mosaik runs again.
- **Turning it off** stops it and deletes what was waiting to be sent. What Mosaik already received stays
  in Mosaik.

## How long the data is kept

- On your computer: until you delete it or uninstall the extension.
- What waits to be sent to Mosaik: until it is sent, or until you turn "Send to Mosaik" off.

## Your choices

- **Turn off the immersion profile** in the dashboard settings: no more pages are looked at.
- **Turn off "Send to Mosaik"** in the dashboard: nothing more is sent, and what was waiting is deleted.
- **Uninstall** the extension to delete everything it kept on that computer.

## Who gets the data

Nobody. Inputly has no analytics, no advertising and no trackers; it does not sell data and does not share
it with anyone. With "Send to Mosaik" on, it gives your data to your Mosaik, at the address you set. It does
not use or transfer data for anything other than showing you your progress and sending it to Mosaik if you ask
for it.

The use of information received from Chrome APIs adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements.

## Firefox

The Firefox version is the same code and does the same: everything in this policy applies to it, with
`browser.storage.local` in place of `chrome.storage.local` and a Firefox profile in place of a Chrome profile.
It declares to Firefox that it collects no data, since nothing goes to the developer or to anyone else; "Send
to Mosaik" only sends to the Mosaik you run, as described above.

## Security

A Mosaik server is only reached over HTTPS, with a device token. The security policy, and how to report a
problem, is in [SECURITY.md](SECURITY.md).

## Children

Inputly is not aimed at children, and it does not know the age of anyone: it knows nothing about who uses
it.

## Changes to this policy

If this policy changes, the date at the top changes, and the changes are in the
[changelog](CHANGELOG.md) of the project. A change that sends more data than described here will not be
made without asking you first.

Until 18 November 2026 Inputly could sync the time of several computers through a server of its own. That
sync is gone: the extension deletes what it kept of it when it updates, and the time of several computers is
now put together by Mosaik, if you use it.
