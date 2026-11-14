# Privacy policy

_Last updated: 14 November 2026._

**In short:** Deuchan keeps what it counts on your own computer. It sends nothing to the internet unless you
turn on sync, and then it sends only the seconds you watched per day, encrypted in your browser with a key
that never leaves it, so the server cannot read it. If you turn on "Send to Mosaik", it also sends what you
watched to Mosaik, an app on your own computer, and to nowhere else. There are no accounts, no ads, no analytics and no trackers,
and nothing is sold or shared.

## Who is behind Deuchan

Deuchan is a free, open-source browser extension by Joaquín Muzzi (Frodouwu). The code, of the extension and
of the sync server, is in <https://github.com/joaquinmuzzi/deuchan>, so everything this policy says can be
checked there.

Contact: joaquin.hola.muzzi@gmail.com, or an
[issue](https://github.com/joaquinmuzzi/deuchan/issues) for anything that is not private.

## What Deuchan does when sync is off (the default)

Deuchan runs on `youtube.com` pages. To count the time you watch German, it reads, **in your browser**:

- whether the video is playing or paused;
- the language of the automatic captions of the video, and its title and description, only to decide
  whether it is in German. The description is not stored. The title is kept only in the list of videos
  described below. Nothing is sent anywhere.

It stores on your computer (in `chrome.storage.local`):

- the **seconds you watched per day** (a date and a number);
- the **videos that made up each of the last 60 days**: the id and the title of each German video and the
  seconds you watched of it, so that you can see what a day was made of and correct it. This list stays on
  this computer. It is never sent to the internet, not even when sync is on (with "Send to Mosaik" on, it
  goes to Mosaik, on this same computer: [see below](#what-happens-when-you-turn-on-send-to-mosaik));
- the **corrections** you make to a day (a number of seconds, and when you made it);
- your **daily goal** and your settings (light or dark, the range of the chart);
- the **ids of the videos you marked** as German or as not German, so the decision is remembered;
- a **random identifier of this computer**, which is not linked to you;
- only if you turn on "Send to Mosaik": its settings, and the events that wait to be sent to it.

All of this stays in your browser. It is deleted when you uninstall the extension, and you can look at it
in the dashboard. Deuchan does not read your YouTube account, your history, your searches or your
recommendations, and does not run on any other site. The only record of what you watched is the list of
German videos above, which stays on your computer and which you can see in the dashboard, on each day.

## What happens when you turn sync on

Sync is **optional and off by default**. You turn it on in the dashboard, to see the same progress on more
than one computer. Then:

- Your browser makes a **sync key** (32 letters and digits). Two things are made from it, and neither can
  be turned into the other: a **token**, which proves to the server that you know the key, and an
  **encryption key**, which never leaves your browser.
- Every few minutes your browser sends the server one **encrypted block**. Inside, before it was encrypted:
  the random identifiers of your computers and, for each one, the seconds per day and the corrections
  you made to a day. Nothing else: no video, no title, no address, no name, no email.
- The server stores the block under the **hash of the token**. It cannot read the block (it does not have
  the encryption key) and cannot tell who it belongs to. There are no accounts, emails or passwords.
- Your other computers, when you enter the key on them, read the block and decrypt it in the browser.

**Anyone who has your sync key can read your synced time**, so keep it private. It is kept in your browser
while sync is on, and shown in the dashboard only when you ask.

### What the server and its host can see

- **The sync server** (code in `server/`) receives the token, the encrypted block, and, as any server does
  when it is spoken to, the internet address of the request. The server itself does not store or log
  addresses or tokens.
- **Its host, [Railway](https://railway.com)**, runs it in the United States (us-west2). Railway records its
  own access logs of every request to the server: the **IP address, the browser (user agent), the path,
  the status and the time**. They do not include the token or the block, which are not in the address. These
  logs are kept by Railway for the period of its plan, under
  [its own privacy policy](https://railway.com/legal/privacy), and Deuchan has no use for them.

## What happens when you turn on Send to Mosaik

"Send to Mosaik" is **optional and off by default**. Mosaik is a separate app, by the same author, that runs
on your own computer and puts together how you learn languages (Anki, games, YouTube). If you use it, you
can turn this on in the dashboard (the squares button). Then:

- You set the address of Mosaik, which has to be **on this computer**: `http://127.0.0.1` or
  `http://localhost`, on any port (`http://127.0.0.1:7300` unless you change it). Any other address is
  refused. Your browser asks you for the permission to reach that address; without it, nothing is sent.
- Every minute, Deuchan sends Mosaik:
  - each **stretch of a video** you watched: when it started and ended, the seconds counted, and the id and
    title of the video;
  - the **total of each day** as the dashboard shows it, with the videos of that day (id, title, seconds).
    The first time you turn it on, it sends the total of every day in your history;
  - when you **take a video out of a day**: the day, the id of the video, and when.
- All of it goes only to that address on your computer: not to the internet, not to the developer, not to
  any other computer. What Mosaik does with it is up to Mosaik, on your computer.
- While Mosaik is not running, what is to be sent waits in your browser (at most about 5000 events; if there
  are more, the oldest stretches go first) and is sent when Mosaik runs again.
- **Turning it off** stops it and deletes what was waiting to be sent. What Mosaik already received stays
  in Mosaik.

## How long the data is kept

- On your computer: until you delete it or uninstall the extension.
- On the server: until you delete it, or until nobody has written or read it for **400 days**, when the
  server deletes it by itself.
- What waits to be sent to Mosaik: until it is sent, or until you turn "Send to Mosaik" off.

## Your choices

- **Turn sync off** in the dashboard: it stops, and what was synced stays on your computers and on the
  server.
- **Delete synced data** in the dashboard: it removes your block from the server. A computer that still has
  sync on sends its time again in its next round, so turn sync off on all your computers first.
- **Turn off "Send to Mosaik"** in the dashboard: nothing more is sent, and what was waiting is deleted.
- **Uninstall** the extension to delete everything it kept on that computer.

Because the server cannot tell whose a block is, a request to delete or to see your data can only be
answered for someone who has the sync key, and the way to do it is the button above: it needs no request.

## Who gets the data

Nobody. Deuchan has no analytics, no advertising and no trackers; it does not sell data and does not share
it with anyone, apart from the host that runs the server, described above. With "Send to Mosaik" on, it
gives your data to Mosaik, on your own computer. It does not use or transfer data for anything other than
showing you your progress, syncing it, and sending it to Mosaik if you ask for it.

The use of information received from Chrome APIs adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements.

## Security

The block is encrypted with AES-256-GCM before it leaves your browser, and everything travels over HTTPS.
The server limits the size of a block, the number of blocks and the requests of an address and of a key.
The security policy, and how to report a problem, is in [SECURITY.md](SECURITY.md).

## Children

Deuchan is not aimed at children, and it does not know the age of anyone: it knows nothing about who uses
it.

## Changes to this policy

If this policy changes, the date at the top changes, and the changes are in the
[changelog](CHANGELOG.md) of the project. A change that sends more data than described here will not be
made without asking you first.
