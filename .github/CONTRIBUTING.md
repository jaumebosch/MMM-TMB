# Contributing to MMM-TMB

Thanks for taking the time to contribute!

**Working on your first Pull Request?** You can learn how from this _free_ series
[How to Contribute to an Open Source Project on GitHub](https://egghead.io/series/how-to-contribute-to-an-open-source-project-on-github).

## Getting set up

```bash
git clone https://github.com/jaumebosch/MMM-TMB.git
cd MMM-TMB
npm install
```

Node.js 18 or newer is required (the module uses the built-in `fetch` and test runner).

## Before opening a pull request

```bash
npm run check   # lint + formatting + tests
```

Individual commands:

| Command                 | What it does                          |
| ----------------------- | ------------------------------------- |
| `npm test`              | Runs the test suite (`node --test`)   |
| `npm run test:coverage` | Runs the tests with a coverage report |
| `npm run lint`          | ESLint over the whole repository      |
| `npm run lint:fix`      | ESLint with autofix                   |
| `npm run format`        | Rewrites files with Prettier          |
| `npm run format:check`  | Fails if anything is unformatted      |

CI runs the same checks on Node 18, 20 and 22.

## Project layout

| Path             | Runs in | Responsibility                                       |
| ---------------- | ------- | ---------------------------------------------------- |
| `MMM-TMB.js`     | Browser | MagicMirror module: state and lifecycle              |
| `src/frontend/`  | Browser | DOM rendering                                        |
| `src/shared/`    | Both    | Config validation, arrival normalisation and sorting |
| `node_helper.js` | Node    | Wiring: one poller per module instance               |
| `src/backend/`   | Node    | TMB API client, arrivals service, polling scheduler  |
| `translations/`  | Browser | User-facing strings                                  |
| `test/`          | Node    | Test suite, including DOM and MagicMirror doubles    |

Anything under `src/shared/` must run unchanged in both environments: it is loaded
through `getScripts()` in the browser and through `require()` in Node.

## Guidelines

- Never build DOM from strings. API data is inserted with `textContent`; the test
  suite fails if `innerHTML` is ever assigned.
- Never put the `appId` / `appKey` in a log line or an error message.
- User-facing text goes in `translations/*.json`, one key per string, and all three
  languages must be updated together.
- New behaviour comes with a test.
