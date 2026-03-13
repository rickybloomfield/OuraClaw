# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added global `--version` / `-V` support so the CLI can print its package version without running a command.
- Added a GitHub Actions CI workflow and README badges for CI, npm, and coverage status.
- Added a migration guide for users uninstalling the legacy OpenClaw plugin and moving to the standalone CLI.
- Added a delivery confirmation handshake for `summary morning-optimized` so the CLI can suppress duplicate sends after
  successful same-day delivery.
- Added detailed documentation for the optimized morning routine, including baseline bands, breach counting, and the
  OpenClaw delivery-confirmation flow.
- Added first-class `schedule` commands for OpenClaw cron setup, status, disable, and legacy plugin cron migration.
- Added delivery-language-aware OpenClaw scheduling, including a repeated optimized morning watcher and a dedicated
  scheduling guide.
- Added an optimized watcher delivery mode that can either alert only on unusual days or send every day once today's
  Oura data is actually ready.
- Added a dedicated setup guide and restored the explicit Oura application creation steps near the top of the README.

### Changed

- Expanded `summary morning-optimized` baseline evaluation to all six morning decision metrics and made baseline
  sensitivity configurable through percentile bands and breach-count settings.
- Updated the main README to highlight the optimized morning flow and link directly to the detailed guide.
- Updated `setup` so it can hand off into the same scheduling walkthrough when OpenClaw is available.

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
- Adjusted OAuth authorization requests to use Oura's documented `http://localhost:9876/callback` redirect URI and
  removed undocumented PKCE parameters while keeping `state` validation.

### Removed

- Removed OpenClaw plugin registration, tool wiring, and cron-management runtime files from the shipped architecture.
