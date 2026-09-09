# MMM-TMB Change Log

All notable changes to this project are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.3]

### Fixed

- The installation instructions told users to run `npm install --omit=dev`. It installs nothing —
  there are no runtime dependencies — but it does rewrite `package-lock.json`, so every later
  `git pull` failed with "local changes would be overwritten". The step is gone, and there is now
  an Updating section covering how to recover if it was already run.

## [2.0.2]

### Fixed

- The route name was glued to the route number and sat above its baseline. The cells now align on
  the baseline and are separated by `--mmm-tmb-column-gap`.
- The shared `td` rule set `padding: 1px 0`, a shorthand more specific than the per-cell rules, so
  every `padding-right` in the stylesheet was silently discarded. It now uses vertical longhand.

## [2.0.1]

### Fixed

- The header lost its bus icon in the 2.0.0 rewrite, which replaced the original markup with plain
  text. The icon is back, and the label is escaped since MagicMirror renders the header as markup.
- The README's example config set `header: "Bus"`, which silently replaced the "TMB iBus" title for
  anyone who copied it. Removed.

### Added

- `showHeaderIcon` to turn the bus icon off.

## [2.0.0]

Full rewrite of the internals. The configuration stays backwards compatible: an existing
`config.js` block keeps working, and the new options all have defaults.

### Breaking

- Node.js 18 or newer is now required, and MagicMirror² 2.15.0 or newer.
- The `timeFormat` option was removed; it was never used.
- CSS classes are now namespaced (`.arriving` → `.MMM-TMB-warning` / `.MMM-TMB-blinking`,
  `.stopCell` → `.MMM-TMB-stop`, `.timeCell` → `.MMM-TMB-time`). Custom CSS needs updating.

### Fixed

- API data is rendered with `textContent` instead of `innerHTML`, closing a script-injection
  path through stop names.
- `maxEntries` is now actually applied; it was documented but ignored.
- Missing `appId` / `appKey` are now detected. The old check compared against `""` and never
  fired, so a missing credential produced a silent, empty module.
- API credentials no longer reach the logs. Failed requests used to log the full URL,
  `app_id` and `app_key` included.
- Requests now time out (`requestTimeout`) instead of hanging forever.
- Failures are retried with exponential back-off (`retryDelay`), which was previously ignored.
- A stop whose lookup fails no longer blanks the whole module; it degrades on its own.
- Malformed API entries are skipped instead of rendering as `NaN min`.
- Several instances of the module on one mirror no longer overwrite each other's data.
- The refresh loop is torn down on stop, and restarting the mirror no longer leaks a timer.
- The blink animation now has an unprefixed `@keyframes` rule and respects
  `prefers-reduced-motion`.

### Added

- Translations: English, Catalan and Spanish. All user-facing text is translated.
- Configuration validation with actionable messages rendered on the mirror.
- Countdowns are recomputed locally every 15 s, so times stay accurate between refreshes, and the
  DOM is only rebuilt when the output would actually differ.
- Staleness detection: after three missed refreshes the module says the times are out of date
  instead of counting a frozen snapshot down to "no buses".
- Rejected credentials (HTTP 401/403) stop the polling loop and are reported as such, instead of
  retrying against the API forever.
- The API's `Retry-After` header is honoured on rate limits, capped at one hour.
- `showDestination` renders the destination reported by the API, which was parsed and discarded.
- `npm run smoke` queries the live API once to verify credentials, a stop code, or which fields a
  stop actually returns.
- Arrivals from every configured stop are merged and sorted by time to arrival.
- `requestTimeout`, `showStopName` and `showDestination` options.
- CSS custom properties for colours and stop-name width.
- Stop names are cached after the first lookup, halving the number of API calls per refresh.
- Stops are queried concurrently rather than one after another.
- Test suite (`node --test`, 119 tests, ~99% line coverage), ESLint, Prettier and CI on
  Node 18/20/22.

### Removed

- All runtime dependencies. `axios` was replaced by the built-in `fetch`; `moment`, `ajv` and
  `follow-redirects` were unused.

## [1.2.0] - Added MultiStop

Now you can specify some routes and from diferent stops<br>
Removed node_modules folder<br>
Updated README.md<br>
CSS fixes and improvements<br>
Moved code to axios instead of request

## [1.1.2] - Fixes

Fixed error with leading zeroes in busStop code<br>
Fixed showing undefined as busLine code when defining busLine<br>
Changed layout

## [1.1.1] - Fix

Fixed warning time and blinking time magnitude as the API sends then in seconds

## [1.1.0] - New features

Added visual warnings

## [1.0.1] - Minor fixes

Solved minor problems in data presentation

## [1.0.0] - Unreleased

First public release
