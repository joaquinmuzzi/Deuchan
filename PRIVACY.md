# Privacy policy

_Last updated: 29 October 2026._

**In short:** Deuchan keeps what it counts on your own computer. It sends nothing anywhere unless you turn
on sync, and then it sends only the seconds you watched per day, encrypted in your browser with a key that
never leaves it, so the server cannot read it. There are no accounts, no ads, no analytics and no trackers,
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
  whether it is in German. These are not stored and not sent anywhere.

It stores on your computer (in `chrome.storage.local`):

- the **seconds you watched per day** (a date and a number, nothing about which videos);
- your **daily goal** and your settings (light or dark, the range of the chart);
- the **ids of the videos you marked** as German or as not German, so the decision is remembered;
- a **random identifier of this computer**, which is not linked to you.

All of this stays in your browser. It is deleted when you uninstall the extension, and you can look at it
in the dashboard. Deuchan does not read your YouTube account, your history, your searches or your
recommendations, does not record what you watch, and does not run on any other site.

## What happens when you turn sync on

Sync is **optional and off by default**. You turn it on in the dashboard, to see the same progress on more
than one computer. Then:

- Your browser makes a **sync key** (32 letters and digits). Two things are made from it, and neither can
  be turned into the other: a **token**, which proves to the server that you know the key, and an
  **encryption key**, which never leaves your browser.
- Every few minutes your browser sends the server one **encrypted block**. Inside, before it was encrypted:
  the random identifiers of your computers and, for each one, the seconds per day. Nothing else: no video,
  no title, no address, no name, no email.
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

## How long the data is kept

- On your computer: until you delete it or uninstall the extension.
- On the server: until you delete it, or until nobody has written or read it for **400 days**, when the
  server deletes it by itself.

## Your choices

- **Turn sync off** in the dashboard: it stops, and what was synced stays on your computers and on the
  server.
- **Delete synced data** in the dashboard: it removes your block from the server. A computer that still has
  sync on sends its time again in its next round, so turn sync off on all your computers first.
- **Uninstall** the extension to delete everything it kept on that computer.

Because the server cannot tell whose a block is, a request to delete or to see your data can only be
answered for someone who has the sync key, and the way to do it is the button above: it needs no request.

## Who gets the data

Nobody. Deuchan has no analytics, no advertising and no trackers; it does not sell data and does not share
it with anyone, apart from the host that runs the server, described above. It does not use or transfer data
for anything other than showing you your progress and syncing it.

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
