# Firefox

What it takes to run Inputly in Firefox (task 2.6 of the [plan](plan.md)), what was checked and how, and what
is still to be tried by hand. The listing for Firefox Add-ons (AMO) is in
[store-listing.md](store-listing.md#firefox-add-ons-amo).

## One codebase, two builds

Every file of `extension/` is the same in both browsers. Only the manifest differs, and it is made from the
Chrome one by [`scripts/firefox.mjs`](../scripts/firefox.mjs):

- `background.service_worker` becomes `background.scripts` (with the same `type: "module"`). Firefox has no
  extension service worker; it runs the same module as an event page, which it also stops when idle, so the
  code already copes with being stopped and started again.
- `browser_specific_settings.gecko` is added: the add-on id `inputly@joaquinmuzzi.github.io` (AMO keeps it
  forever: never change it after the first upload), `strict_min_version` `140.0`, and
  `data_collection_permissions` `{ "required": ["none"] }` (see [Data collection](#data-collection)).
- `minimum_chrome_version` is left out, since Firefox warns about it.

```bash
npm run package           # dist/inputly-<version>.zip, for Chrome and Edge (unchanged)
npm run package:firefox   # dist/inputly-firefox-<version>.zip, and the same files unpacked in dist/firefox/
npm run lint:firefox      # the Firefox build, checked with Mozilla's linter (web-ext lint)
```

`npm run lint:firefox` runs the linter AMO runs on every upload (`web-ext`, a devDependency), and CI runs it
on every pull request. It fails on any error and on any warning not allowed in
[`scripts/lint-firefox.mjs`](../scripts/lint-firefox.mjs). The only one allowed says Firefox for Android got
`data_collection_permissions` in 142; Inputly is not offered for Android (see below).

## Why Firefox 140

It is the first version with the built-in data consent that AMO asks of every new extension since November
2025 (`data_collection_permissions`), and the current ESR. What the code itself needs is older:

| What Inputly uses                                                   | Firefox since |
| ------------------------------------------------------------------- | ------------- |
| `content_scripts` with `world: "MAIN"` (the YouTube page bridge)    | 128           |
| `optional_host_permissions`                                         | 128           |
| `storage.session` (the sound of tabs, in the immersion profile)     | 115           |
| `background.type: "module"`                                         | 112           |
| `action.setIcon`, `setBadgeText`                                    | 109           |
| `web_accessible_resources` with `matches`                           | 109           |
| `scripting.registerContentScripts` with `persistAcrossSessions`     | 102 (105)     |
| `permissions.onRemoved`                                             | 77            |
| `idle` (`setDetectionInterval`, `onStateChanged`, `queryState`)     | 51            |
| `i18n.detectLanguage` (the text of videos in languages not German)  | 47            |
| `tabs.query({ audible })`, `tabs.onUpdated` audible changes, alarms | 45            |

The versions come from MDN's browser compatibility data (`@mdn/browser-compat-data`, which the linter
bundles), checked on 2026-11-23.

## What works as it is

No line of code had to change. In more detail:

- **The `chrome` namespace.** Firefox implements `chrome.*` as well as `browser.*`, and in Manifest V3 its
  `chrome.*` calls return promises, as Inputly uses them.
- **Language detection.** `chrome.i18n.detectLanguage` exists in Firefox and works on the computer too (it
  uses its own detector, CLD2), with the same answer shape (`isReliable`, `languages[].language`,
  `percentage`). Its results may differ a little from Chrome's on short titles; the audio track and the
  automatic captions, which decide first, do not depend on it.
- **The YouTube page bridge** (`src/page-bridge.js`, `world: "MAIN"`) and the dynamic `import()` of the
  modules through `runtime.getURL` from the content scripts.
- **Idle, alarms, tabs that play sound, badges and icons drawn on an `OffscreenCanvas`** (Firefox 105+, also
  in a background page).
- **`runtime.OnInstalledReason.INSTALL`** is exposed in Firefox, so the first-install page opens.
- **Optional permissions requested from a click.** Firefox only shows the prompt when `permissions.request`
  is called from a user action, with no `await` before it. The dashboard already does it that way, for the
  immersion profile and for "Send to Mosaik", because Chrome wants the same.

## How it degrades, or may differ

- **Firefox for Android: not offered.** Most APIs exist there, but YouTube on a phone is `m.youtube.com`, where
  the content scripts do not run, and the dashboard is made for a desktop screen. Tick only Firefox (desktop)
  on AMO.
- **YouTube access can be taken away.** Since Firefox 127, the hosts of `content_scripts` are shown in the
  install prompt and granted with it, but the person can revoke "Access your data for www.youtube.com" in
  `about:addons`. Then nothing counts on YouTube, silently. The popup could say so (a follow-up, if people
  get confused).
- **The immersion profile right after it is granted.** `background.js` registers its script only when
  `chrome.scripting` exists. In Chrome the namespace appears as soon as the optional permission is granted;
  in Firefox this was not checked in a real browser. If it does not appear until the background page starts
  again, turning the profile on would only start counting other sites after Firefox stops the idle event page
  (about 30 seconds) or after a restart.

## Data collection

AMO asks every new extension to declare what it collects, as data "transmitted for storage and processing
outside the extension". Inputly sends nothing to the developer or to anyone else, so the build declares
`{ "required": ["none"] }`. "Send to Mosaik" sends the time, titles and addresses to a server the person
runs and types in themselves, with a token they made in it; that was read as not being collection by the
developer, but Mozilla's text does not cover a self-hosted server.

If the AMO review reads it the other way, the change is small: declare
`"optional": ["browsingActivity", "websiteActivity", "websiteContent"]` and, in the Firefox build only, ask for
them with `permissions.request({ data_collection: [...] })` from the same click that turns on "Send to
Mosaik" (Chrome rejects that key, so it needs a check of the browser). It is a decision for the maintainer.

## Source code for the review

AMO asks for the source when the package has minified, concatenated or generated code. Inputly has none: the
zip is the files of `extension/` as they are in the repository, with only the manifest rewritten by a short
script that is readable in the repository too. So no source upload is needed. `web-ext lint` lists six
files as possibly minified (`dashboard/dashboard.js`, `src/background.js` and four more); it is a heuristic
that looks at how many of the first 30 lines are indented, and those files start with a long comment and
their imports. If a reviewer asks, point them to the repository and the tag of the version.

## How it was checked

- `npm run lint:firefox`: 0 errors, and only the Android warning above. The linter also looks for APIs that do
  not exist in the minimum version, and found none.
- Tests (`tests/firefox.test.js`): the Firefox manifest, and that its package has the same files as the
  Chrome one, byte for byte except the manifest.
- **Not loaded in a real Firefox.** Firefox was not installed on the computer that made the build, and the
  session did not install it. Before submitting, try it by hand (see below).

## Trying it by hand

1. `npm run package:firefox`.
2. In Firefox 140 or later, open `about:debugging#/runtime/this-firefox`, press **Load Temporary Add-on** and
   pick `dist/firefox/manifest.json`. It stays until Firefox closes.
3. Check, in this order:
   - the first-install page opens and the language can be picked;
   - a YouTube video in that language counts (the toolbar icon turns orange) and one in another language
     does not; try one whose language only the title says, with a target other than German, to exercise
     `i18n.detectLanguage`;
   - the popup's "Not <language>" button and "Count reading" (it stops after 15 idle minutes);
   - the dashboard: the day, its videos, correcting a day, the chart, the dark theme;
   - the immersion profile: turning it on asks for the permissions, then a video on another site counts
     (note whether it starts at once or only after about 30 seconds) and a tab playing a podcast counts after
     30 seconds;
   - "Send to Mosaik" asks for the one host and sends (only if a Mosaik server is at hand).
4. `about:debugging` → **Inspect** shows the console of the background page, for errors.
