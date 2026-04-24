# AGENTS.md

This file is a repo map for AI agents working in `ouraclaw-cli`.

## Repo Role

This repository is the source of truth for Oura automation logic. It ships:

- a standalone CLI (`ouraclaw-cli`)
- an OpenClaw skill under `skills/oura/`

JSON output is the default mode for automation consumers. OpenClaw integration is skill-only; there is no plugin
runtime in the final architecture.

## Contract Map

### External CLI Surface

- `setup`
- `auth login`
- `auth status`
- `auth refresh`
- `fetch <endpoint> [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]`
- `baseline rebuild`
- `baseline show`
- `config get [key]`
- `config set <key> <value>`
- `summary morning`
- `summary morning-confirm`
- `summary week-overview`
- `summary evening`

### Output Contract

- JSON is the default output mode for every command.
- `--text` is supported on summary commands for sendable human recap text.
- `fetch` returns raw Oura endpoint JSON payloads.

## Code Map

- `src/index.ts` - executable shim
- `src/cli.ts` - top-level Commander wiring and command handlers
- `src/config.ts` - filesystem paths, defaults, endpoint constants
- `src/state-store.ts` - state read/write, migration, private permissions
- `src/oauth.ts` - OAuth state/PKCE helpers and callback capture
- `src/auth.ts` - token lifecycle and auth status orchestration
- `src/oura-client.ts` - Oura API HTTP client
- `src/thresholds.ts` - fixed-threshold defaults, validation, evaluation
- `src/baseline.ts` - baseline windows, statistics, staleness checks
- `src/summaries.ts` - evening recap assembly
- `src/morning.ts` - canonical morning summary decision logic
- `src/week-overview.ts` - seven-day optimized metric overview assembly
- `src/output.ts` - JSON/text printing helpers

Primary docs:

- `docs/architecture.md`
- `docs/guides/command-reference.md`
- `docs/guides/configuration.md`
- `docs/guides/troubleshooting.md`

## Development and Verification

If Node/npm is unavailable in shell:

```bash
source ./node-check.sh
```

Core commands:

```bash
npm run build
npm run typecheck
npm test
npm run test:coverage
./code-quality.sh
```

## Documentation and Changelog Rules

- On any code change update documentation
- Any functional or documentation change must be recorded in `CHANGELOG.md`.
- Keep this file focused on repo role, contracts, navigation, and verification.

## Release and Publishing Map

- npm publish workflow: `./publish-to-npm.sh`
- ClawHub skill preview/publish: `./skills/upload-to-clawhub.sh`

## Git Policy

Do not create commits unless explicitly requested.
