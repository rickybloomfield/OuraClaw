# oura-cli-p

`oura-cli-p` is a standalone CLI for Oura automation. It fetches Oura data, manages OAuth tokens and local thresholds,
builds summary output, and ships an optional OpenClaw skill that invokes the CLI directly.

## Install

```bash
npm install -g oura-cli-p
```

Or from source:

```bash
git clone https://github.com/robert7/oura-cli-p.git
cd oura-cli-p
npm install
npm run build
```

## Quick Start

Run the interactive setup wizard:

```bash
oura-cli-p setup
```

The wizard:

1. Collects your Oura client ID and client secret.
2. Opens the hardened OAuth flow in a browser.
3. Stores tokens plus threshold defaults in `$HOME/.oura-cli-p/oura-cli-p.json`.

When creating or updating your Oura application, register the redirect URI exactly as
`http://localhost:9876/callback`. Oura validates the redirect URI string literally.

## Common Commands

```bash
oura-cli-p fetch daily_sleep
oura-cli-p fetch sleep --start-date 2026-03-12 --end-date 2026-03-13
oura-cli-p auth status
oura-cli-p baseline rebuild
oura-cli-p summary morning --text
oura-cli-p summary morning-optimized
oura-cli-p summary evening --text
```

JSON is the default output mode. Use `--text` on summary commands when you want a ready-to-send recap.

## OpenClaw Skill

The packaged skill lives in `skills/oura/`. It requires the `oura-cli-p` binary to be installed on the same machine as
OpenClaw and keeps command invocations short and allowlist-friendly.

## Documentation

- [Architecture](docs/architecture.md)
- [Command reference](docs/guides/command-reference.md)
- [Configuration](docs/guides/configuration.md)
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
