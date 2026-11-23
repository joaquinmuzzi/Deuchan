# Chrome Web Store listing

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole), and the
files to upload. The package is made with `npm run package` (`dist/deuchan-<version>.zip`, only what is in
`extension/`). The privacy policy is [PRIVACY.md](../PRIVACY.md).

## Store listing tab

**Name:** Deuchan

**Summary** (it is the `description` of the manifest, 132 characters at most):

> Counts your input in the language you learn (Japanese, Spanish, Korean, German...) on YouTube, automatically. Daily goal and charts.

**Category:** Education

**Language:** English

**Description:**

```
Deuchan counts the time you spend watching the language you learn on YouTube, by itself: Japanese,
Spanish, Korean, German, French, Chinese or any other. No timers to start or stop: you watch, and it adds up
the minutes. It is made for people who learn a language by immersion and want to see how much input they
really get.

WHAT YOU GET
• Pick the language you learn when you install it, and change it any time in the settings. The popup and
  the dashboard speak of it: "Counting Japanese", "Not Japanese".
• Automatic. It counts the real seconds a video in your language plays. Pausing, rewinding and looping are handled,
  and at 2x a minute is still a minute. Two tabs playing at once count once.
• Only that language. It works out the language of each video from the audio track that plays and the
  automatic captions YouTube makes from the speech, or, when there are none, from its title and description
  (with Chrome's built-in language detector, on your computer). It ignores the rest. When it gets one wrong,
  a button in the popup marks that video as in your language, or as not, and it is remembered.
• Click a day to see which videos made it up, take out the ones that were not in your language, or correct the
  minutes if the day looks wrong.
• An immersion profile, for a Chrome profile you use only for the language you learn: every video that plays with sound
  counts, on any site (Twitch, streaming sites, anything), with no guessing. It is off by default and set
  for each Chrome profile apart.
• Reading with no video, like a comic: a button in the popup counts it until you stop it, or until you
  leave the computer for 15 minutes. It counts toward your goal.
• A daily goal that you set, with what is left today and a progress bar, and your streak.
• A dashboard: totals, daily and monthly averages, an activity heatmap by month, a chart of your time per
  day (7 days to 1 year, with your goal as a line) and your average for each weekday.
• The toolbar icon turns orange while the video you are watching is in your language.
• Light and dark mode.

PRIVATE BY DEFAULT
Everything stays in your browser. Nothing is sent anywhere. No accounts, no ads, no analytics, no trackers.

OPTIONAL: SEND TO MOSAIK
If you use Mosaik, an app that puts together how you learn languages, Deuchan can send it what you watch:
to Mosaik on your own computer, or on your own server with a device token. Every computer sends its own
time, and the dashboard shows the total of all of them. Mosaik takes German only for now: with another
language, sending pauses.

OPEN SOURCE
The extension is open source (MIT): https://github.com/joaquinmuzzi/deuchan

Deuchan is an independent project. It is not affiliated with, endorsed by or sponsored by YouTube or
Google. YouTube is a trademark of Google LLC.
```

**Images** (1280 × 800 JPEG, from the real extension with demo data):

1. [Dashboard, dark](store/screenshot-1-dashboard-dark.jpg)
2. [Dashboard, light](store/screenshot-2-dashboard-light.jpg)
3. [The popup](store/screenshot-3-popup.jpg): there is no video in the browser that took it, so the answer
   of the tab ("Counting German") was given by hand; everything else is the real popup.

The images still show German, the language they were made with; task 2.2 of the [plan](plan.md) makes them
again in another language too.

**Small promo tile** (440 × 280): [promo-small-440x280.jpg](store/promo-small-440x280.jpg)

**Support site:** <https://github.com/joaquinmuzzi/deuchan/issues>

**Homepage:** <https://github.com/joaquinmuzzi/deuchan> (it is also `homepage_url` in the manifest)

## Privacy tab

**Single purpose:**

> Track how much time the user spends watching videos in the language they learn (on YouTube, or any video
> in a Chrome profile the user sets for that language) and reading, and show their progress toward a daily
> goal.

**Permission justifications:**

| Permission                                                              | Why                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                               | Keeps, in the browser of the user, the seconds watched per day, the videos and readings of the last 60 days with their title, address and seconds, the daily goal, the settings (the language the user learns among them) and the decisions of the user about which videos are in that language.                                    |
| `alarms`                                                                | Sends to Mosaik every minute, only while the user has it on, and counts the reading the user started by hand. A service worker cannot keep a timer, so it needs an alarm.                                                                                                                                                           |
| `idle`                                                                  | Stops the reading counted by hand when nobody has used the computer for 15 minutes, so that time away is not counted. It says only whether the computer is in use.                                                                                                                                                                  |
| `activeTab`                                                             | When the user presses "Count reading" in the popup, reads the address and the title of that one tab, to name what is being read.                                                                                                                                                                                                    |
| Optional permission `scripting`                                         | Not granted at install. Asked for only when the user turns on the immersion profile: it adds the script that finds the videos of other sites.                                                                                                                                                                                       |
| Optional host permissions `http://127.0.0.1/*` and `http://localhost/*` | Not granted at install. Asked for only when the user turns on "Send to Mosaik" in the dashboard: it sends the watch time to Mosaik, an app of the user that runs on their own computer. Nothing goes to another computer.                                                                                                           |
| Optional host permission `https://*/*`                                  | Not granted at install, and never granted whole for Mosaik: when the user turns on "Send to Mosaik" with the address of their own Mosaik server, the extension asks for that one host only (`https://<their host>/*`). The server takes the data only with a device token the user made in it.                                      |
| Optional host permission `<all_urls>`                                   | Not granted at install. Asked for only when the user turns on the immersion profile, for a Chrome profile they use only for the language they learn: every video that plays with sound counts, on any site. The script only looks for videos and whether they play; only the address and title of a page where one played are kept. |
| Content scripts on `https://www.youtube.com/*`                          | Read, in the page of the video, whether it is playing, which audio track plays and the language of its captions, title and description, to count only the time of videos in the language the user learns. Only the id and the title of the video that is counted are kept, on the computer of the user.                             |

**Remote code:** No. All the code is in the package; the extension loads nothing from the internet.

**Data usage** (the form lists categories of data; please read its own definitions as you fill it, as I
could not see it):

- _User activity_: **yes, if you consider the seconds watched per day to be it.** Nothing goes to the
  developer. With "Send to Mosaik" on (off by default), the extension sends the watch times and the ids,
  titles and addresses of the videos to the user's own Mosaik, at the address they set: on their computer
  (`127.0.0.1` or `localhost`) or their own server over https, with a device token.
- _Website content_: the extension reads the title, description and caption language of a video, only in the
  browser and only to decide if it is in the language the user learns. It keeps the title and id of the
  videos counted in the last 60 days, on the computer only, never sent, so that the user can see what made up a day. If the form counts
  local processing, tick this too.
- _Web history_: the list of videos above is a list of pages visited. It never leaves the computer, and the
  form asks about data that is collected, but if its definition counts data kept locally, tick this too.
- Leave the rest unticked: no personally identifiable information, health, financial, authentication,
  personal communications or location is handled.

**Certifications** (all three can be ticked as they are true): the data is not sold to third parties, not
used for purposes unrelated to the single purpose, and not used to decide credit or lending.

**Privacy policy URL:** <https://github.com/joaquinmuzzi/deuchan/blob/main/PRIVACY.md>

## Notes for the reviewers (test instructions)

> The extension counts time on YouTube videos in the language the user learns, which it asks for when it is
> installed (German unless another is chosen; it can be changed in the dashboard settings). To try it with
> German: open any German video on youtube.com (for example a news or a vlog channel in German), press play,
> and open the extension popup: it says "Counting German" and the time of today goes up. Open the dashboard
> from the popup ("Dashboard"). A video in another language says "Not German, not counted". In the dashboard settings, the immersion profile
> counts every video of any site (it asks for access to the sites first). "Count reading" in the popup
> counts time with no video. No account or login is needed for anything.

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
