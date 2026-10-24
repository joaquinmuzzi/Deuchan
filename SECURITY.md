# Security policy

## Supported versions

Deuchan is a small project: only the latest release (and `main`) receives fixes.

## How Deuchan is exposed

Deuchan is a browser extension that runs on `youtube.com` pages. It reads the state of the video
player (playing, paused, playback speed and the language of the captions) and stores a log of how
long you watched in `chrome.storage.local`, on your own computer. It does not send anything to any
server, it has no remote code and it asks for no host permission other than YouTube.

Examples of problems we want to hear about:

- any way for a web page to read or change the log or the settings of the extension;
- the extension sending data out of your browser;
- a permission that is broader than what the extension needs;
- a vulnerable dependency that Deuchan actually uses in a vulnerable way.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub instead:
[Report a vulnerability](https://github.com/joaquinmuzzi/deuchan/security/advisories/new)
(the _Security_ tab of the repository, then _Report a vulnerability_).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get
an answer within 7 days. Once a fix is ready, it is released and the advisory is published,
crediting you unless you prefer otherwise.
