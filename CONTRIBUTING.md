# Contributing to Deuchan

Thanks for your interest in Deuchan! This guide explains how to report problems, set up a
development environment and send changes. By taking part you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a wrong language detection.** Deuchan only counts German videos, and deciding the
  language of a video is a guess. Open a
  [Wrong language detection](https://github.com/joaquinmuzzi/deuchan/issues/new?template=wrong_detection.yml)
  issue with a link to the video and what went wrong.
- **Report a bug** (time is not counted, the popup is empty, the extension breaks a page) with the
  [Bug report](https://github.com/joaquinmuzzi/deuchan/issues/new?template=bug_report.yml) form.
- **Suggest a feature** with the
  [Feature request](https://github.com/joaquinmuzzi/deuchan/issues/new?template=feature_request.yml) form.
- **Send a pull request.** For anything bigger than a small fix, open an issue first so we can
  agree on the approach before you spend time on it.

Security problems should not be reported in public issues: see [SECURITY.md](SECURITY.md).

## Development environment

You need Node.js 24 (or later), npm, git and a Chromium browser (Chrome, Edge or Brave).

```bash
npm ci
```

To try the extension, open `chrome://extensions`, turn on _Developer mode_, choose _Load
unpacked_ and select the `extension` folder. After a change, press the reload button of the
extension and reload the YouTube tab.

## Tests

```bash
npm test
```

The tests use the test runner that comes with Node.js (`node --test`); there is nothing else to
install. The logic that matters (counting time, deciding the language, adding up the log) lives in
small modules without browser APIs, so it is tested with plain functions. When you fix a wrong
detection, add a test that reproduces it with the titles, descriptions and caption languages of
the video (never with copyrighted transcripts).

## Code style

[ESLint](https://eslint.org/) lints the code and [Prettier](https://prettier.io/) formats it; the
configuration is in `eslint.config.js` and `.prettierrc.json`.

```bash
npm run lint           # lint
npm run format         # format
npm run format:check   # check the format, as CI does
```

Everything is written in English: identifiers, comments, commit messages and documentation.
Comments explain _why_ the code does something, especially the reasoning behind a threshold or a
heuristic.

## Project layout

```
extension/
  manifest.json      the extension (Manifest V3)
  src/               modules without browser APIs, covered by tests
tests/               node:test tests
```

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <description>

<optional body: what changed and why>

<optional footers, e.g. BREAKING CHANGE: ...>
```

- **Types:** `feat` (new feature), `fix` (bug fix), `docs`, `style` (formatting only),
  `refactor`, `perf`, `test`, `build` (dependencies, packaging), `ci`, `chore`, `revert`.
- **Scopes** are optional and short, usually the area of the code: `tracker`, `language`,
  `popup`, `storage`, `deps`.
- Write the description in the imperative mood ("add", not "added"), in lowercase, without a
  final period.
- Mark breaking changes with `!` after the type and a `BREAKING CHANGE:` footer that explains
  what users need to change.
- Keep commits **atomic**: one logical change per commit, with its tests.

Examples from this repository:

```
feat(language): detect German from the caption tracks of the video
fix(tracker): stop counting while the video is buffering
build(deps): bump eslint from 10.0.0 to 10.1.0
```

## AI-assisted contributions

You can use AI tools (Claude Code, Codex, Copilot, Cursor…), but say so, as the
[Linux kernel](https://docs.kernel.org/process/coding-assistants.html) and
[asbplayer](https://github.com/asbplayer/asbplayer/blob/main/CONTRIBUTING.md) ask:

- **Every commit made with an AI assistant ends with a trailer** naming the tool and the model:

  ```
  Assisted-by: AGENT_NAME:MODEL_VERSION
  ```

  For example `Assisted-by: Claude Code:claude-opus-5-5` or `Assisted-by: GitHub Copilot:gpt-5`.
  Write one line per assistant if you used more than one. Editors, linters and formatters do not
  count.

- **The pull request description ends with the same line**, or with `Assisted-by: none` if no AI
  tool was used. Pull requests are squash-merged and their description becomes the commit message
  on `main`, so this is where the line stays in the history. CI checks that it is there.
- **You are responsible for the change**, whoever wrote it: read and understand every line, run
  `npm run lint`, `npm run format:check` and `npm test` yourself, and say in the description what
  you ran.

Pull requests that were not run, or that are sent in bulk to many projects at once, are closed.

## Pull requests

1. Fork the repository and create a branch from `main` (for example `fix/count-paused-video`).
2. Make your change with its tests, and run `npm run lint`, `npm run format` and `npm test`.
3. Open a pull request. Its **title must follow Conventional Commits**: CI checks it, and the
   pull request is squash-merged, so the title becomes the commit message on `main`.
4. In the description, explain what changes, why, and how you tested it, and end it with the
   `Assisted-by:` line (see [AI-assisted contributions](#ai-assisted-contributions)). The
   template has the sections.
5. CI runs the linter and every test on Linux. A maintainer reviews the change once it is green.

Keep pull requests small and focused: a bug fix, a feature or a refactor, not all three. If a
change needs a refactor first, send the refactor as its own pull request.

## Licensing

By contributing, you agree that your contributions are released under the
[MIT License](LICENSE), like the rest of the code.
