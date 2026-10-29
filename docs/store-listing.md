# Chrome Web Store listing

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole), and the
files to upload. The package is made with `npm run package` (`dist/deuchan-<version>.zip`, only what is in
`extension/`). The privacy policy is [PRIVACY.md](../PRIVACY.md).

## Store listing tab

**Name:** Deuchan

**Summary** (it is the `description` of the manifest, 132 characters at most):

> Counts the time you spend watching German on YouTube, automatically. Daily goal, charts and optional encrypted sync.

**Category:** Education

**Language:** English

**Description:**

```
Deuchan counts the time you spend watching German on YouTube, by itself. No timers to start or stop: you
watch, and it adds up the minutes. It is made for people who learn German by immersion and want to see how
much input they really get.

WHAT YOU GET
• Automatic. It counts the real seconds a German video plays. Pausing, rewinding and looping are handled,
  and at 2x a minute is still a minute. Two tabs playing at once count once.
• Only German. It works out the language of each video from its captions (or its title and description) and
  ignores the rest. When it gets one wrong, a button in the popup marks that video as German, or as not
  German, and it is remembered.
• A daily goal that you set, with what is left today and a progress bar, and your streak.
• A dashboard: totals, daily and monthly averages, an activity heatmap by month, a chart of your time per
  day (7 days to 1 year, with your goal as a line) and your average for each weekday.
• The toolbar icon turns orange while the video you are watching is in German.
• Light and dark mode.

PRIVATE BY DEFAULT
Everything stays in your browser. Nothing is sent anywhere unless you turn on sync. No accounts, no ads, no
analytics, no trackers.

OPTIONAL SYNC BETWEEN YOUR COMPUTERS
Turn it on in the dashboard to get a sync key, and enter that key on your other computers: they share
their time per day and all show the total. Your time is encrypted in your browser (AES-256-GCM) before it
is sent, with a key that never leaves it, so the server cannot read it. There are no accounts. You can turn
sync off, or delete your data from the server, whenever you want.

OPEN SOURCE
The extension and the sync server are open source (MIT): https://github.com/joaquinmuzzi/deuchan

Deuchan is an independent project. It is not affiliated with, endorsed by or sponsored by YouTube or
Google. YouTube is a trademark of Google LLC.
```

**Images** (1280 × 800 JPEG, from the real extension with demo data):

1. [Dashboard, dark](store/screenshot-1-dashboard-dark.jpg)
2. [Dashboard, light](store/screenshot-2-dashboard-light.jpg)
3. [The popup](store/screenshot-3-popup.jpg): there is no video in the browser that took it, so the answer
   of the tab ("Counting German") was given by hand; everything else is the real popup.
4. [The sync panel](store/screenshot-4-sync.jpg): with a made-up key, hidden.

**Small promo tile** (440 × 280): [promo-small-440x280.jpg](store/promo-small-440x280.jpg)

**Support site:** <https://github.com/joaquinmuzzi/deuchan/issues>

**Homepage:** <https://github.com/joaquinmuzzi/deuchan> (it is also `homepage_url` in the manifest)

## Privacy tab

**Single purpose:**

> Track how much time the user spends watching German-language videos on YouTube, show their progress
> toward a daily goal, and optionally sync that progress between the user's own computers.

**Permission justifications:**

| Permission                                                      | Why                                                                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                                       | Keeps, in the browser of the user, the seconds watched per day, the daily goal, the settings and the decisions of the user about which videos are in German.                                     |
| `alarms`                                                        | Starts the sync of the progress every few minutes, only while the user has sync on. A service worker cannot keep a timer, so it needs an alarm.                                                  |
| Host permission `https://sync-production-78f2.up.railway.app/*` | The sync server. Used only when the user turns sync on, to send and receive one encrypted block with the progress. It is the only address the extension can talk to.                             |
| Content scripts on `https://www.youtube.com/*`                  | Read, in the page of the video, whether it is playing and the language of its captions, title and description, to count only the time of German videos. Nothing from the page is stored or sent. |

**Remote code:** No. All the code is in the package; the extension loads nothing from the internet.

**Data usage** (the form lists categories of data; please read its own definitions as you fill it, as I
could not see it):

- _User activity_: **yes, if you consider the seconds watched per day to be it.** It is the only data that
  leaves the browser, and only when the user turns sync on, encrypted so that the developer cannot read it.
- _Website content_: the extension reads the title, description and caption language of a video, only in the
  browser and only to decide if it is German; it does not keep or send them. If the form counts local
  processing, tick this too.
- Leave the rest unticked: no personally identifiable information, health, financial, authentication,
  personal communications, location or web history is handled.

**Certifications** (all three can be ticked as they are true): the data is not sold to third parties, not
used for purposes unrelated to the single purpose, and not used to decide credit or lending.

**Privacy policy URL:** <https://github.com/joaquinmuzzi/deuchan/blob/main/PRIVACY.md>

## Notes for the reviewers (test instructions)

> The extension counts time on YouTube videos in German. To try it: open any German video on youtube.com
> (for example a news or a vlog channel in German), press play, and open the extension popup: it says
> "Counting German" and the time of today goes up. Open the dashboard from the popup ("Dashboard"). A video
> in another language says "Not German, not counted". Sync is optional: in the dashboard, the cloud button
> turns it on and shows a sync key; entering that key in another browser profile syncs both. No account or
> login is needed for anything.

## What has to be done by hand

I (an assistant) cannot create the account or pay, so these are for the owner:

1. Register as a Chrome Web Store developer (a one-time fee of US$5) at the
   [developer dashboard](https://chrome.google.com/webstore/devconsole).
2. Run `npm run package` and upload `dist/deuchan-<version>.zip` as a new item.
3. Fill in the three tabs with the texts and the images of this page.
4. Submit for review. The first review can take days, and a wide permission or a vague single purpose is
   what makes it longer: that is why each permission is justified above.

For the next versions, raise `version` in `extension/manifest.json` (the store does not accept the same
number twice), write the change in the [changelog](../CHANGELOG.md), and upload the new package.
