# ouraclaw-cli

[![CI](https://github.com/robert7/ouraclaw-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/robert7/ouraclaw-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40robertvii%2Fouraclaw-cli)](https://www.npmjs.com/package/@robertvii/ouraclaw-cli)
[![codecov](https://codecov.io/gh/robert7/ouraclaw-cli/branch/main/graph/badge.svg)](https://codecov.io/gh/robert7/ouraclaw-cli)

Based on [Ricky Bloomfield's OuraClaw](https://github.com/rickybloomfield/OuraClaw), this fork refactors the original
OpenClaw plugin into a standalone, JSON-first CLI while keeping the `oura` skill compatible through a CLI-backed
adaptation. It also adds an optimized morning flow that avoids stale yesterday fallback data and only sends when
something is genuinely out of the ordinary.

`ouraclaw-cli` is a standalone CLI for Oura automation. It fetches Oura data, manages OAuth tokens and local thresholds,
builds summary output, and ships an optional OpenClaw skill that invokes the CLI directly.

## Install

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

## Quick Start

Run the interactive setup wizard:

```bash
ouraclaw-cli setup
```

The wizard:

1. Collects your Oura client ID and client secret.
2. Opens the hardened OAuth flow in a browser.
3. Stores tokens plus threshold defaults in `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.

When creating or updating your Oura application, register the redirect URI exactly as
`http://localhost:9876/callback`. Oura validates the redirect URI string literally.

## Common Commands

```bash
ouraclaw-cli fetch daily_sleep
ouraclaw-cli fetch sleep --start-date 2026-03-12 --end-date 2026-03-13
ouraclaw-cli auth status
ouraclaw-cli baseline rebuild
ouraclaw-cli summary morning --text
ouraclaw-cli summary morning-optimized
ouraclaw-cli summary evening --text
```

JSON is the default output mode. Use `--text` on summary commands when you want a ready-to-send recap.

## Optimized Morning Flow

`summary morning-optimized` is the quiet-by-default alert path: it compares today's Oura data against fixed thresholds
plus your personal baseline and only recommends sending when something is genuinely out of the ordinary. See
[Optimized morning routine](docs/guides/optimized-morning-routine.md) for the full decision logic, baseline tuning, and
delivery-confirmation flow.

## OpenClaw Skill

The packaged skill lives in `skills/oura/`. It requires the `ouraclaw-cli` binary to be installed on the same machine as
OpenClaw and keeps command invocations short and allowlist-friendly.

## Documentation

- [Architecture](docs/architecture.md)
- [Command reference](docs/guides/command-reference.md)
- [Configuration](docs/guides/configuration.md)
- [Optimized morning routine](docs/guides/optimized-morning-routine.md)
- [Migration Guide](docs/guides/migrating-from-openclaw-plugin.md)
- [Troubleshooting](docs/guides/troubleshooting.md)

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
npm run test:coverage
./code-quality.sh
```

## License

MIT
