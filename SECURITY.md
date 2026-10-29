# Security policy

## Supported versions

Deuchan is a small project: only the latest release (and `main`) receives fixes.

## How Deuchan is exposed

Deuchan is a browser extension that runs on `youtube.com` pages. It reads the state of the video
player (playing, paused and the language of the captions) and stores a log of how long you watched in
`chrome.storage.local`, on your own computer. **By default nothing leaves your browser.** It has no
remote code, its pages load nothing from the internet, and the only address it is allowed to talk to
(besides running on YouTube) is the sync server, and only if you turn sync on.

### Sync (optional, off by default)

If you turn sync on, the time you watched per day is sent to the sync server so that your computers
can share it. What the server receives and can do:

- **It receives a block of encrypted data.** The extension encrypts it (AES-256-GCM) before sending it,
  with a key made from your sync key that never leaves your browser. The server cannot read the data and
  cannot change it without the change being noticed.
- **It does not know who you are.** There are no accounts, emails or passwords. The server stores the
  block under the hash of a token that is made from your sync key, and keeps no address, no log of
  requests with keys, and nothing about the videos you watched.
- **Anyone who has your sync key can read your synced time**, so keep it private. The key is stored in
  your browser while sync is on.
- **You can delete it**: "Delete synced data" in the dashboard removes the block from the server. A
  computer that still has sync on sends its time again in its next round, so turn sync off on all your
  computers first. A block that is not used for 400 days is deleted by the server.

The server is in `server/` and is covered by tests; it limits the size of a block, the number of
blocks and the requests of an address and of a key.

Examples of problems we want to hear about:

- any way for a web page to read or change the log or the settings of the extension;
- the extension sending data out of your browser when sync is off, or anything other than the encrypted block when it is on;
- a way to read the data of a person from the sync server without their sync key, or to read or delete
  the block of someone else;
- a way to make the sync server unavailable for other people with little effort;
- a permission that is broader than what the extension needs;
- a vulnerable dependency that Deuchan actually uses in a vulnerable way.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub instead:
[Report a vulnerability](https://github.com/joaquinmuzzi/deuchan/security/advisories/new)
(the _Security_ tab of the repository, then _Report a vulnerability_).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get
an answer within 7 days. Once a fix is ready, it is released and the advisory is published,
crediting you unless you prefer otherwise.
