# Chrome Web Store listing

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole), and the
files to upload. The package is made with `npm run package` (`dist/inputly-<version>.zip`, only what is in
`extension/`). The privacy policy is [PRIVACY.md](../PRIVACY.md).

## Store listing tab

**Name:** Inputly – Track your language input

It is the `name` of the manifest (75 characters at most). The toolbar button says only "Inputly".

**Summary** (it is the `description` of the manifest, 132 characters at most):

> Counts your input in the language you learn: detects the language of each YouTube video. Daily goal, charts, private, no account.

**Category:** Education

**Language:** English

**Description:**

```
Inputly counts the time you spend on input in the language you learn (Japanese, Spanish, Korean, German,
French, Chinese or any other) and shows it against a daily goal. No timers to start or stop: you watch,
and it adds up the minutes. It is made for people who learn a language by immersion and want to know how
much input they really get.

WHAT MAKES INPUTLY DIFFERENT
• It decides the language of each YouTube video. You do not need an account or a profile kept only for
  the language: Inputly looks at the audio track that plays and the automatic captions YouTube makes from
  the speech or, when there are none, at the title and description (with Chrome's built-in language
  detector, on your computer). Videos in other languages are not counted.
• One click corrects it. When it gets a video wrong, a button in the popup marks it as in your language, or
  as not, and the choice is remembered. Click a day in the dashboard to see the videos that made it up,
  take one out, or correct the minutes of the whole day.
• Your day ends at 4:00, not at midnight: an episode watched late at night counts for that day.
• An immersion profile counts any site and any sound. Turn it on in a Chrome profile you use only for the
  language you learn: every video that plays with sound counts, on any site, and so does any tab that plays
  sound for 30 seconds or more, like a podcast. It is off by default.
• Reading counts too. A button in the popup counts a comic, a book or an article until you stop it, or until
  you leave the computer for 15 minutes.
• Private, with no account. Everything stays in your browser. No sign-up, no ads, no analytics, no
  trackers.

HOW IT COUNTS
• It counts the real seconds a video in your language plays. Pausing, rewinding and looping are handled,
  and at 2x a minute is still a minute. Two tabs playing at once count once.
• By itself it counts YouTube. Other sites (streaming sites, Twitch, podcasts) count only with the
  immersion profile on.
• Pick your language when you install it, and change it any time in the settings. The popup says it:
  "Counting Japanese", "Not Japanese, not counted".

WHAT YOU SEE
• A daily goal that you set, what is left today, a progress bar and your streak.
• A dashboard: totals, daily and monthly averages, an activity heatmap by month, a chart of your time per
  day (7 days to 1 year, with your goal as a line) and your average for each weekday.
• The toolbar icon turns orange while the video you are watching is in your language.
• Light and dark mode.

OPTIONAL: SEND TO MOSAIK
If you run Mosaik, an app that puts together how you learn languages, Inputly can send it what you watch
and read: to Mosaik on your own computer, or on your own server with a device token. It is off by default,
and nothing goes anywhere else. Mosaik takes German only for now: with another language, sending pauses.

OPEN SOURCE
The extension is open source (MIT): https://github.com/joaquinmuzzi/inputly

Inputly is an independent project. It is not affiliated with, endorsed by or sponsored by YouTube or
Google. YouTube is a trademark of Google LLC.
```

**Images** (1280 × 800 JPEG, from the real extension pages with the invented history of someone who learns
Japanese; the first two show what only Inputly does). Upload them in this order:

1. [A day opened to its videos](store/screenshot-1-day-videos.jpg), each with "Not Japanese" to take it out
   of the day, and the minutes to correct.
2. [The popup](store/screenshot-2-popup.jpg) saying "Counting Japanese", beside a few lines on the detection
   per video, the one-click correction and the day that ends at 4:00. The answer of the YouTube tab is
   given by the demo, as there is no video playing; everything else is the real popup.
3. [Dashboard, dark](store/screenshot-3-dashboard-dark.jpg)
4. [Dashboard, light](store/screenshot-4-dashboard-light.jpg)
5. [The language picker](store/screenshot-5-language.jpg) in the settings, drawn as an open list (a native
   drop-down does not show in a screenshot).

They are made with `node scripts/screenshots/capture.mjs` (see task 2.2 in the [plan](plan.md#notes)).

**Small promo tile** (440 × 280): [promo-small-440x280.jpg](store/promo-small-440x280.jpg)

**Support site:** <https://github.com/joaquinmuzzi/inputly/issues>

**Homepage:** <https://github.com/joaquinmuzzi/inputly> (it is also `homepage_url` in the manifest)

## Privacy tab

**Single purpose:**

> Track how much time the user spends on input in the language they learn (videos on YouTube, any video or
> sound in a Chrome profile the user sets for that language, and reading they count by hand), and show their
> progress toward a daily goal.

**Permission justifications** (one field per permission in the form; paste the text of its row):

| Permission                                                              | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                               | Keeps, in the browser of the user, the seconds counted per day, the videos and readings of the last 60 days with their title, address and seconds, the corrections the user made to a day, the daily goal, the settings (the language the user learns among them) and the decisions of the user about which videos are in that language. Nothing is synced or sent by this permission.                                                                         |
| `alarms`                                                                | A service worker cannot keep a timer, so a one-minute alarm does the periodic work: it adds up the reading the user started by hand, the sound of tabs while the immersion profile is on, and, only while the user has "Send to Mosaik" on, sends to their Mosaik. No alarm runs while none of these is in use.                                                                                                                                                |
| `idle`                                                                  | Stops the reading counted by hand when nobody has used the computer for 15 minutes, so that time away is not counted. It says only whether the computer is in use.                                                                                                                                                                                                                                                                                             |
| `activeTab`                                                             | The popup works on the tab the user has open when they click the toolbar button: "Count reading" reads the address and the title of that one tab to name what is being read, and the popup asks that tab whether its video is in the language the user learns.                                                                                                                                                                                                 |
| Optional permission `scripting`                                         | Not granted at install. Asked for only when the user turns on the immersion profile in the settings: it registers the small script that finds the videos of other sites and whether they play. Turning the profile off unregisters it.                                                                                                                                                                                                                         |
| Optional host permissions `http://127.0.0.1/*` and `http://localhost/*` | Not granted at install. Asked for only when the user turns on "Send to Mosaik" in the dashboard with the address of Mosaik on their own computer: it sends the counted time to that app of the user. Nothing goes to another computer.                                                                                                                                                                                                                         |
| Optional host permission `https://*/*`                                  | Not granted at install, and never requested whole: when the user turns on "Send to Mosaik" with the address of their own Mosaik server, the extension asks for that one host only (`https://<their host>/*`). The pattern is declared because the address is typed by the user and cannot be known in advance. The server takes the data only with a device token the user made in it.                                                                         |
| Optional host permission `<all_urls>`                                   | Not granted at install. Asked for only when the user turns on the immersion profile, meant for a Chrome profile they use only for the language they learn: every video that plays with sound counts, on any site, and so does a tab that plays sound. The script only looks for videos and whether they play; only the address, the title and the seconds of a page where something played are kept, in the browser, never sent unless "Send to Mosaik" is on. |
| Content scripts on `https://www.youtube.com/*`                          | Read, in the page of the video, whether it is playing, which audio track plays and the language of its captions, title and description, to count only the time of videos in the language the user learns. One small script runs in the page itself because the player data is not visible to the isolated content script; it only reads it and never writes to the page. Only the id and the title of the video counted are kept.                              |

`web_accessible_resources` lists two scripts (`src/tracker.js`, `src/watcher.js`) for `<all_urls>`. It is not
a permission: it lets the immersion script, which runs only where the user granted `<all_urls>`, load the
extension's own counting code. The reviewer may ask; the answer is this.

**Remote code:** No, I am not using remote code. All the code is in the package; the extension loads
nothing from the internet and evaluates no strings as code.

**Data usage.** The form asks which data the extension collects, and the
[user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) says data kept or
processed only on the device must be disclosed too. So tick what Inputly handles, even though nothing goes to
the developer:

- [ ] Personally identifiable information: **no.** No name, email, address or id of the user.
- [ ] Health information: **no.**
- [ ] Financial and payment information: **no.**
- [ ] Authentication information: **no.** The Mosaik device token is typed by the user, kept in the browser
      and sent only to their own Mosaik; it is not a login to anything of the developer. If the form's own
      definition counts it, tick it and say so in the policy (PRIVACY.md already does).
- [ ] Personal communications: **no.**
- [ ] Location: **no.**
- [x] Web history: **yes.** The videos and readings of the last 60 days (address, title, seconds) are a list
      of pages visited, kept in the browser, and sent to the user's own Mosaik only with "Send to Mosaik" on.
- [x] User activity: **yes.** Whether a video plays, and the seconds counted, are activity on the page;
      the idle state only stops the reading timer.
- [x] Website content: **yes.** The title, description and caption languages of a YouTube video are read in
      the browser to decide its language; the title is kept with the video.

**Certifications** (tick all three, they are true):

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** <https://github.com/joaquinmuzzi/inputly/blob/main/PRIVACY.md>

## Notes for the reviewers (test instructions)

Paste this in the "Test instructions" field of the item (no account or login is needed):

> 1. After installing, a page of the extension opens and asks for the language the user learns. Pick
>    **English** and press Save (the default is German; it can be changed later in the dashboard settings,
>    the Settings button at the top).
> 2. Open any English video on youtube.com and press play. Open the extension popup from the toolbar: it
>    says "Counting English", the toolbar icon turns orange, and the time of today goes up.
> 3. Open a video in another language (for example a Spanish or Japanese news video). The popup says "Not
>    English, not counted", and a button "Mark as English" corrects the guess for that video.
> 4. "Dashboard" in the popup opens the charts; click a day to see the videos counted that day.
> 5. Optional features, all off at install: in the dashboard settings, the immersion profile counts every
>    video and sound of any site (it asks for access to the sites first); "Count reading" in the popup counts
>    time with no video; "Send to Mosaik" needs Mosaik, an app of the user, and can be left off.

## What has to be done by hand

The developer account exists and is declared as a non-trader (task 2.1 of the [plan](plan.md)). What is left
is for the owner:

1. Run `npm run package`. It makes `dist/inputly-<version>.zip` from `extension/` (the version is the one of
   `extension/manifest.json`).
2. In the [developer dashboard](https://chrome.google.com/webstore/devconsole), press **New item** and upload
   the zip.
3. **Store listing tab:** paste the description, choose the category and the language, upload the five
   screenshots in their order and the small promo tile from `docs/store/`, and fill in the support site and
   the homepage. The name and the summary come from the manifest.
4. **Privacy tab:** paste the single purpose, each permission justification, answer "No" to remote code,
   tick the data usage boxes and the three certifications as listed above, and paste the privacy policy URL.
5. **Distribution tab:** free, public, all regions.
6. **Test instructions:** paste the notes for the reviewers.
7. Submit for review. Most reviews take a few days, but broad host permissions can make them longer (see
   [Review time](#review-time)). If it is still pending after three weeks, contact developer support.

For the next versions, raise `version` in `extension/manifest.json` (the store does not accept the same
number twice), write the change in the [changelog](../CHANGELOG.md), and upload the new package.

## Review time

The [review process](https://developer.chrome.com/docs/webstore/review-process) page says reviews may take
longer for extensions that request broad host permissions, and names `https://*/*` and `<all_urls>` among
them. It does not say whether `optional_host_permissions` counts; developers report that the in-depth review
warning shows for broad patterns in `host_permissions` and content script matches, and less clearly for
optional ones. Inputly declares both only as optional and requests them at runtime, which is what the
[permissions docs](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
recommend, so the first review may or may not be longer.

Ways to narrow them, and what each costs (task 2.10 of the [plan](plan.md)):

- **Drop `https://*/*`.** `<all_urls>` already covers it, and Chrome accepts a runtime request for any
  origin inside a declared optional pattern, so asking for the Mosaik server's one host keeps working. One
  broad pattern fewer, at no cost to features.
- **Ask for each site in the immersion profile** (a "count this site" button in the popup that requests that
  one origin) instead of `<all_urls>`. It removes the broad pattern, but the profile would no longer count
  any site with no setup, which is what sets it apart; and the Mosaik server would then need its own broad
  pattern back. Worth it only if the review asks for it.
