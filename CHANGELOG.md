# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added a standalone `ouraclaw-cli` CLI with JSON-first commands for setup, auth, fetch, config, baseline management, and
  morning/evening summaries.
- Added hardened OAuth helpers with `state`, explicit `127.0.0.1` callback binding, and timeout cleanup.
- Added local state management at `$HOME/.ouraclaw-cli/ouraclaw-cli.json`, including migration from the old OpenClaw plugin
  config path and private file-permission enforcement.
- Added baseline and threshold decision logic for `summary morning-optimized`.
- Added Vitest coverage for state migration, OAuth behavior, Oura fetch requests, baseline computation, thresholds, and
  summary flows.
- Added packaged OpenClaw skill tooling under `skills/` plus a ClawHub upload helper.

### Changed

- Renamed the project/package/binary identity to `ouraclaw-cli` and updated npm publishing to the org-scoped public
  package `@robertvii/ouraclaw-cli`.
- Converted the project from an OpenClaw plugin package into a standalone CLI package that ships an optional skill.
- Rewrote `skills/oura/SKILL.md` to invoke `ouraclaw-cli` directly instead of relying on an `oura_data` plugin tool.
- Reworked `skills/oura/SKILL.md` so normal morning/evening summaries and optimized morning alerts are rendered from
  skill-owned templates and channel-formatting guidance using JSON output from `ouraclaw-cli`, with delivery language
  taken from the request rather than hardcoded English.
- Replaced plugin-centric README/docs with standalone CLI architecture and command guides.
- Adjusted OAuth authorize requests to match Oura's documented contract by using the exact
  `http://localhost:9876/callback` redirect URI and removing undocumented PKCE parameters while keeping `state`
  validation.

### Removed

- Removed OpenClaw plugin registration, tool wiring, and cron-management runtime files from the shipped architecture.
