# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added Dependabot configuration for grouped npm and GitHub Actions updates.
- Added `auth login` for re-authenticating with Oura without changing thresholds, baseline tuning, or schedules.
- Added `summary week-overview` for seven-day JSON summaries with optimized-metric attention details.
- Added `link-cli.sh` and `unlink-cli.sh` helper scripts for npm-based local global linking from a source checkout.

### Changed

- Reworked `summary morning-optimized` around attention signals: replaced `ordinary`, `breachedMetrics`, and generic
  `reasons` with `shouldAlert`, `alertMetrics`, `alertReasons`, `skipReasons`, and per-metric `metricSignals`.
- Changed optimized baseline evaluation to be direction-aware so better HRV or lower resting heart rate no longer
  triggers an alert, while worse primary metrics can still alert by themselves.
- Renamed baseline tuning from breached-metric counting to `baselineConfig.supportingMetricAlertCount`, defaulting to
  two worse supporting metrics before the optimized baseline path alerts.
- Clarified setup output when OpenClaw is unavailable and added explicit percentile-band wording to the baseline
  sensitivity prompt.
- Moved setup's existing-auth reauthentication prompt before threshold and baseline tuning.
- Fixed range-based sleep record fetching so weekly and baseline summaries include overnight sleep that started the
  previous calendar day.
- Compacted weekly overview JSON around localization-friendly metric entries, ordered daily summary lines, attention
  metric lists, and missing metric lists.
- Added a dedicated `summary week-overview` skill template with explicit delivery-language guidance for localized
  weekly recaps.
- Clarified the README and core docs so the CLI is positioned as automation-first and usable without OpenClaw, while
  promoting `summary week-overview` as a first-class recap surface.
- Expanded the README install section to explain when to use `link-cli.sh` / `unlink-cli.sh` instead of the published
  global npm install.
- Upgraded runtime and tooling dependencies in phases, including `commander` 14, TypeScript 6, ESLint 10.2, Vitest 4.1.3, and related type/lint packages.
- Raised the documented and enforced Node.js engine floor to 20 to match the supported runtime and CI.
- Updated the TypeScript compiler configuration from legacy Node resolution to `Node16`/`node16` so typecheck stays compatible with TypeScript 6.

## [0.3.0] - 2026-03-13

### Added

- Added global `--version` / `-V` support so the CLI can print its package version without running another command.
- Added first-class OpenClaw scheduling commands for setup, status, disable, and legacy plugin cron migration.
- Added delivery-language-aware scheduling, including a repeated optimized morning watcher that can re-check until
  today's Oura data is ready.
- Added a delivery confirmation handshake for `summary morning-optimized` so successful sends can suppress duplicate
  same-day notifications.
- Added migration and setup guides for users moving from the legacy OpenClaw plugin and configuring Oura application
  credentials.

### Changed

- Expanded `summary morning-optimized` to evaluate all six morning decision metrics against the personalized baseline,
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
- Added baseline and threshold decision logic for `summary morning-optimized`.
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
