# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- `setup` now respects the `BROWSER` environment variable before falling back to the platform-default browser opener.

### Fixed

- Hardened OAuth callback capture so stray browser probes no longer abort the local login flow before the real
  authorization redirect arrives.

## [0.5.0] - 2026-04-16

### Added

- Added `summary week-overview --text` for a compact English weekly recap preview in the local CLI.
- Expanded `summary week-overview` with completed-day activity and stress context, including per-day `steps` and
  `daySummary` plus weekly `totalSteps`, `averageSteps`, and `topStressSummaries`.
- Added weekly overview scheduling to `schedule setup`, `schedule status`, and `schedule disable`, including a fixed
  weekday/time OpenClaw cron job for `summary week-overview`.

### Changed

- Restricted `metricSignals[].attention`, `attentionMetrics`, and weekly `⚠️` markers to metrics that actually
  contributed to `alertMetrics`, so supporting outliers remain visible without being treated as actionable attention.
- Changed `summary week-overview` to default to the last seven completed calendar days, excluding today, and to shift
  the morning-style metric bundle back one day so Monday weekly recaps can include Sunday-night sleep on the Sunday
  row.

## [0.4.0] - 2026-04-13

### Added

- Added `auth login` for re-authenticating with Oura without changing thresholds, baseline tuning, or schedules.
- Added `summary week-overview` for seven-day JSON recaps with optimized-metric attention details.
- Added `link-cli.sh` and `unlink-cli.sh` helper scripts for npm-based global linking from a source checkout.

### Changed

- Unified the morning summary surfaces around `summary morning` and `summary morning-confirm`, replacing the separate
  optimized morning contract with a single watcher flow.
- Reworked morning decision output around attention signals with `shouldAlert`, `alertMetrics`, `alertReasons`,
  `skipReasons`, and per-metric `metricSignals`.
- Made optimized baseline evaluation direction-aware and renamed the supporting-metric threshold to
  `baselineConfig.supportingMetricAlertCount`.
- Updated setup and scheduling to ask for the delivery channel first, reuse known channel targets more cleanly, and
  prompt for re-authentication earlier in setup.
- Compacted `summary week-overview` JSON around localization-friendly metric entries and ordered recap content.
- Raised the supported Node.js runtime floor to 20.

### Fixed

- Fixed overnight sleep range fetching so weekly and baseline summaries include sleep that started on the previous
  calendar day.

## [0.3.0] - 2026-03-13

### Added

- Added global `--version` / `-V` support so the CLI can print its package version without running another command.
- Added first-class OpenClaw scheduling commands for setup, status, disable, and legacy plugin cron migration.
- Added delivery-language-aware scheduling, including a repeated optimized morning watcher that can re-check until
  today's Oura data is ready.
- Added a delivery confirmation handshake for the morning summary flow so successful sends can suppress duplicate
  same-day notifications.
- Added migration and setup guides for users moving from the legacy OpenClaw plugin and configuring Oura application
  credentials.

### Changed

- Expanded the morning summary flow to evaluate all six morning decision metrics against the personalized baseline,
  with configurable percentile bands and breached-metric counts.
- Added an optimized watcher delivery mode that can either alert only on unusual days or send every day once today's
  Oura data is ready.
- Updated setup to reuse existing auth by default, stop echoing the stored client secret, ask before opening the OAuth
  browser flow with a headless-aware default, and hand off directly into scheduled delivery setup when OpenClaw is
  installed.

## [0.2.0] - 2026-03-13

### Added

- Added the standalone `ouraclaw-cli` CLI with JSON-first commands for setup, auth, fetch, config, baseline management,
  and morning/evening summaries.
- Added hardened OAuth handling with `state` validation, explicit localhost callback binding, and timeout cleanup.
- Added local state storage at `$HOME/.ouraclaw-cli/ouraclaw-cli.json`, including migration from the legacy OpenClaw
  plugin config path and private file-permission enforcement.
- Added baseline and threshold decision logic for the morning summary flow.
- Added packaged OpenClaw skill assets under `skills/` plus a ClawHub upload helper.

### Changed

- Renamed the project, package, and binary identity to `ouraclaw-cli`, publishing the package as
  `@robertvii/ouraclaw-cli`.
- Converted the project from an OpenClaw plugin package into a standalone CLI package that ships an optional skill.
- Updated `skills/oura/SKILL.md` to call `ouraclaw-cli` directly and render summaries from skill-owned templates using
  CLI JSON output.
- Replaced plugin-centric README/docs with standalone CLI architecture and command guides.

### Removed

- Removed OpenClaw plugin registration, tool wiring, and cron-management runtime files from the shipped architecture.
