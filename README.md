# ouraclaw-cli

[![CI](https://github.com/robert7/ouraclaw-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/robert7/ouraclaw-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40robertvii%2Fouraclaw-cli)](https://www.npmjs.com/package/@robertvii/ouraclaw-cli)
[![codecov](https://codecov.io/gh/robert7/ouraclaw-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/robert7/ouraclaw-cli)

Based on [Ricky Bloomfield's OuraClaw](https://github.com/rickybloomfield/OuraClaw), this fork refactors the original
OpenClaw plugin into a standalone, JSON-first CLI. It keeps the shipped `oura` skill compatible through a CLI-backed
adaptation, but the CLI itself is not tied to OpenClaw. It can be used from shell scripts, cron, other agent systems,
or any automation runner that can invoke a command and consume JSON. It also adds a
**[canonical morning flow](docs/guides/optimized-morning-routine.md)** that avoids stale yesterday fallback data,
waits for real same-day readiness, and still flags attention-worthy mornings clearly.

`ouraclaw-cli` is a standalone CLI for Oura automation. It fetches Oura data, manages OAuth tokens and local thresholds,
builds summary output, and ships an optional OpenClaw skill for users who want OpenClaw-managed delivery.

## Install

`ouraclaw-cli` supports Node.js 20 and newer.

```bash
npm install -g @robertvii/ouraclaw-cli
```

Migrating from the old OpenClaw plugin? See [Migration Guide](docs/guides/migrating-from-openclaw-plugin.md).

Or from source:

```bash
git clone https://github.com/robert7/ouraclaw-cli.git
cd ouraclaw-cli
npm install
npm run build
```

If you want to use the cloned repository itself as the installed CLI instead of the published npm package, use the
repo's development helpers:

```bash
./link-cli.sh
# later, remove the global source link:
./unlink-cli.sh
```

Use this path when you want to:

- test local changes from a git clone as `ouraclaw-cli`
- run an unpublished branch or worktree through the real global CLI entrypoint
- develop the packaged OpenClaw skill against local CLI changes

Use the normal `npm install -g @robertvii/ouraclaw-cli` path when you want the published release from npm.

`./link-cli.sh` always runs `npm install`, `npm run build`, and `npm link`. It aborts if
`@robertvii/ouraclaw-cli` is already installed globally as a normal npm package, so you do not accidentally shadow a
published install with a source checkout. If that happens, uninstall the published package first:

```bash
npm uninstall -g @robertvii/ouraclaw-cli
./link-cli.sh
```

When you are done using the source checkout as the global CLI, run `./unlink-cli.sh` to remove the npm link.

## Quick Start

Before running setup, create an Oura application:

1. Go to [developer.ouraring.com](https://developer.ouraring.com).
2. Open `My Applications` and create a new app.
3. Set the redirect URI to `http://localhost:9876/callback`.

Then run the interactive setup wizard:

```bash
ouraclaw-cli setup
```

The wizard:

1. Collects your Oura client ID and client secret.
2. Reuses existing auth by default unless you explicitly choose to re-authenticate.
3. Asks before opening the hardened OAuth flow in a browser, with a headless/SSH-aware default.
4. Stores tokens plus threshold and baseline defaults in `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.
5. Ends by asking whether you want to continue with OpenClaw scheduled delivery setup when OpenClaw is installed.

OpenClaw is optional. If it is not available, setup still completes the standalone CLI configuration and reports that
OpenClaw delivery was skipped.

Oura validates the redirect URI string literally, so it must be exactly `http://localhost:9876/callback`.

## Works with Any Automation

OpenClaw is one integration, not a requirement.

`ouraclaw-cli` is designed to be useful with:

- OpenClaw
- cron jobs
- shell scripts
- other agent runtimes
- manual CLI use

JSON is the default output mode, so the CLI can act as the stable machine interface while a separate automation layer
decides how, when, and where to deliver messages.

## Key Guides

- [Setup guide](docs/guides/setup.md)
- [Command reference](docs/guides/command-reference.md)
- [Scheduling guide](docs/guides/scheduling.md)
- [Optimized morning routine](docs/guides/optimized-morning-routine.md)
- [Migration Guide](docs/guides/migrating-from-openclaw-plugin.md)
- [Troubleshooting](docs/guides/troubleshooting.md)

## Common Commands

```bash
ouraclaw-cli fetch daily_sleep
ouraclaw-cli fetch sleep --start-date 2026-03-12 --end-date 2026-03-13
ouraclaw-cli auth login
ouraclaw-cli auth status
ouraclaw-cli baseline rebuild
ouraclaw-cli summary morning --delivery-mode daily-when-ready --text
ouraclaw-cli summary morning
ouraclaw-cli summary morning-confirm --delivery-key <deliveryKey>
ouraclaw-cli summary week-overview
ouraclaw-cli summary evening --text
```

JSON is the default output mode. Use `--text` on summary commands when you want a ready-to-send recap.

`summary week-overview` defaults to the last seven days including today and also supports
`--start-date YYYY-MM-DD` / `--end-date YYYY-MM-DD` for a custom seven-day window.

## Scheduling

`ouraclaw-cli` can set up OpenClaw cron jobs for:

- a morning summary watcher that can run once or over a repeated morning window
- a fixed evening recap

The morning summary watcher can wait until today's Oura data is actually synced, then either alert only when attention
is needed or send every day once the real same-day data is ready. Set the same start and end time if you want a single
morning check instead of a repeated window.

Run:

```bash
ouraclaw-cli schedule setup
```

The scheduler now asks for a channel first, then lets you pick a known target or override it manually. That keeps
saved defaults convenient without blocking cases like a custom Discord channel ID.

Existing OuraClaw plugin users can also remove old cron jobs and import useful defaults with:

```bash
ouraclaw-cli schedule migrate-from-ouraclaw-plugin
```

See [Scheduling guide](docs/guides/scheduling.md) for the full walkthrough and [Migration Guide](docs/guides/migrating-from-openclaw-plugin.md) for old plugin cleanup.

## Morning Summary Flow

`summary morning` is the canonical morning path: it compares today's Oura data against fixed thresholds plus your
personal baseline, waits for real same-day readiness, and returns one morning summary contract. Quiet days can still
send a calm recap in `daily-when-ready` mode, while attention days use the same command and result shape with stronger
alert emphasis. See [Optimized morning routine](docs/guides/optimized-morning-routine.md) for the full decision logic,
baseline tuning, and delivery-confirmation flow.

## Weekly Overview

`summary week-overview` builds a compact seven-day JSON overview that is meant for brief weekly recaps: one line per
day, all six optimized metrics in a fixed order, and explicit attention markers for the values that need a closer look.

The command is useful on its own for manual review or external automations, and the shipped Oura skill now includes a
dedicated weekly template for localized delivery. This also sets up the planned Monday flow where the weekly overview
can be embedded into the morning summary message.

## OpenClaw Skill

The packaged skill lives in `skills/oura/`. It requires the `ouraclaw-cli` binary to be installed on the same machine as
OpenClaw and keeps command invocations short and allowlist-friendly.

## Documentation

- [Setup guide](docs/guides/setup.md)
- [Architecture](docs/architecture.md)
- [Command reference](docs/guides/command-reference.md)
- [Configuration](docs/guides/configuration.md)
- [Optimized morning routine](docs/guides/optimized-morning-routine.md)
- [Scheduling guide](docs/guides/scheduling.md)
- [Migration Guide](docs/guides/migrating-from-openclaw-plugin.md)
- [Troubleshooting](docs/guides/troubleshooting.md)

## Development

Use Node.js 20 or newer for local development and CI parity.

```bash
npm install
npm run build
npm run typecheck
npm test
npm run test:coverage
./code-quality.sh

# example command invocations:
npm run dev -- fetch daily_sleep
npm run dev -- summary morning
```

## License

MIT
