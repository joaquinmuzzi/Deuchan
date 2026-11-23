# CLAUDE.md

Instructions for Claude Code sessions in this repository. Read this first, then
[docs/plan.md](docs/plan.md), which says where the project stands and what comes next.

## The project

Inputly (called Deuchan until task 1.6 of the plan) is a Manifest V3 browser extension that counts the time someone spends on input in the
language they learn (any language since phase 1 of the plan): YouTube videos by default, every video and sound of an
"immersion profile", and reading counted by hand. It shows the time against a daily goal, with a
dashboard. Everything stays in the browser unless "Send to Mosaik" is turned on. The maintainer is
also its main user.

The goal now is to turn it into a small product: any language, published in the Chrome Web Store,
and real users. The phases are in [docs/plan.md](docs/plan.md).

## Talking to the maintainer

- Talk to the maintainer in Spanish (rioplatense, "vos"). Everything written in the repository stays
  in English: code, comments, commits, pull requests and documentation (see
  [CONTRIBUTING.md](CONTRIBUTING.md)).
- The repository is public. Keep personal details, money goals, server addresses and tokens out of it.
- **The plan has a private part:** `docs/private/plan.md`, only on the maintainer's computer (`docs/private/` is
  in `.gitignore`). It holds what is not meant to be public. Read it together with
  `docs/plan.md` when it exists (a cloud session or a fresh clone has no copy: say so if a task needs it).
  Update it there when a decision changes, and never copy its content into anything committed or published:
  files, commits, pull requests, issues, store texts.

## Commands

```bash
npm ci                 # once
npm test               # node --test, every test in tests/
npm run lint           # ESLint
npm run format:check   # Prettier, as CI runs it (npm run format fixes it)
npm run package        # dist/inputly-<version>.zip for the Chrome Web Store
npm run package:firefox # dist/inputly-firefox-<version>.zip for Firefox Add-ons (and dist/firefox/)
npm run lint:firefox   # the Firefox build through Mozilla's linter (web-ext lint)
```

Run all three checks (test, lint, format:check) before saying a change is done. `tests/docs.test.js`
checks every Markdown file too: relative links must lead to a file and heading that exist, and no
literal `\n` may appear in the text.

To try it by hand: `chrome://extensions`, Developer mode, Load unpacked, the `extension` folder. In
Firefox: `about:debugging`, Load Temporary Add-on, `dist/firefox/manifest.json` (see
[docs/firefox.md](docs/firefox.md)). Both builds share every file but the manifest, made by
`scripts/firefox.mjs`: code that works in Chrome must keep working in Firefox 140.

## Layout

- `extension/src/`: logic as small modules without browser APIs, tested with plain functions
  (`language.js` decides the language, `tracker.js` and `watcher.js` count time, `log.js` stores days).
  `background.js`, `content.js` and `generic.js` are the glue with the browser.
- `extension/popup/`, `extension/dashboard/`: the pages of the extension.
- `extension/src/mosaik-*.js`: the optional link to Mosaik, a separate project (its contract is
  tested in `tests/mosaik-contract.test.js`).
- `docs/store-listing.md` and `docs/store/`: the text and images for the Chrome Web Store.
- `PRIVACY.md`: the privacy policy linked from the store. Any change in what leaves the browser must
  update it.

## Rules

- **Stored data:** if the shape of what is kept in `chrome.storage` changes, bump `STORAGE_VERSION`
  in `extension/src/log.js` and migrate old data. The maintainer has months of real history; never lose it.
- **The old name stays where it is stored or sent:** storage keys, alarm and message names, and
  `SOURCE = "deuchan"` in `mosaik-events.js` (Mosaik knows the extension by it). Renaming them would
  lose history or break the link to Mosaik.
- **Privacy is a feature:** no analytics, trackers or remote code. A new permission or a new host
  needs a reason the store review will accept, and a line in `PRIVACY.md`.
- **Comments explain why**, especially thresholds and heuristics. Language detection fixes come with
  a test built from the title, description and caption languages of the video.
- **Changelog:** user-visible changes go under `[Unreleased]` in `CHANGELOG.md`.

## How work is split across sessions

One session coordinates (it talks with the maintainer and keeps the plan); other sessions each do one
task.

- **A task is one item of [docs/plan.md](docs/plan.md)**, done on its own branch (`feat/...`,
  `fix/...`, `docs/...`) and ending in one pull request. Follow the commit and pull request rules of
  CONTRIBUTING.md: Conventional Commits title, the template's sections, and the `Assisted-by:` line last.
- **Starting a task:** read this file and the plan, find the task, check that its dependencies are done.
- **Ending a task:** tick it in the plan in the same pull request, and add under "Notes" anything the
  next session needs to know (a decision, a dead end, a follow-up).
- **Two sessions never edit the same files at once.** The plan says which tasks can run in parallel.
- **Ask the maintainer first** before merging, pushing to `main`, publishing to a store, paying for
  anything or creating accounts. Opening a pull request from a task branch is fine when the task says so.
