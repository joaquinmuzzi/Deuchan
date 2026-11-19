# Security policy

## Supported versions

Deuchan is a small project: only the latest release (and `main`) receives fixes.

## How Deuchan is exposed

Deuchan is a browser extension that runs on `youtube.com` pages. It reads the state of the video
player (playing, paused and the language of the audio and the captions) and stores a log of how long you
watched in `chrome.storage.local`, on your own computer. **By default nothing leaves your browser.** It has
no remote code, its pages load nothing from the internet, and it may talk to no address at all until you
allow one.

Two things are optional and off by default:

- **"Send to Mosaik"** sends what you watch to your Mosaik: on this computer, or your own server over https
  with a device token. The browser asks for the permission of that one address.
- **The immersion profile** runs a small script in every page of that Chrome profile, to find its videos.
  The browser asks for the `scripting` permission and access to all the sites when you turn it on.

Examples of problems we want to hear about:

- any way for a web page to read or change the log or the settings of the extension, or to send it time;
- the extension sending data out of your browser when "Send to Mosaik" is off, or anything to an address
  other than the one set when it is on (or the device token anywhere else, or over plain http to another
  computer);
- the script of the immersion profile running, or reading anything, while it is off, or reading more of a
  page than whether a video plays;
- a permission that is broader than what the extension needs;
- a vulnerable dependency that Deuchan actually uses in a vulnerable way.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub instead:
[Report a vulnerability](https://github.com/joaquinmuzzi/deuchan/security/advisories/new)
(the _Security_ tab of the repository, then _Report a vulnerability_).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get
an answer within 7 days. Once a fix is ready, it is released and the advisory is published,
crediting you unless you prefer otherwise.
