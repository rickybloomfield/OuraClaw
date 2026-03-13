# Architecture

`ouraclaw-cli` keeps Oura automation logic in one TypeScript CLI instead of splitting behavior between an OpenClaw plugin,
prompt templates, and shell glue.

The core runtime has four responsibilities:

1. Authentication and token refresh against the Oura OAuth endpoints.
2. Private local state storage at `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.
3. Oura API fetches plus summary and baseline evaluation.
4. A thin OpenClaw integration layer through the shipped skill in `skills/oura/`.

## State Model

The state file stores:

- schema version
- Oura client credentials and tokens
- fixed threshold configuration
- baseline snapshot metadata and metric bounds

The CLI creates the parent directory with private permissions and rewrites the file with private permissions after each
state change. On first read it also checks for the legacy OpenClaw plugin config at
`~/.openclaw/plugins/ouraclaw/config.json` and imports compatible auth fields without deleting the old file.

## OAuth

OAuth uses the registered redirect URI `http://localhost:9876/callback`, because Oura validates redirect URIs exactly.
The local callback server still binds only to `127.0.0.1:9876`, so the browser round-trip stays on the loopback
interface. The authorize URL includes a random `state` token. The callback handler rejects missing or mismatched state
values, closes cleanly on timeout, and writes tokens only after a successful token exchange.

## Baseline Policy

`summary morning-optimized` can refresh the stored baseline automatically when none exists or when the snapshot is more
than one week old. Automatic refresh uses the last three completed calendar weeks relative to last Monday. Manual
rebuild uses the previous 21 days excluding today.

The stored baseline tracks these sleep metrics when available:

- `average_hrv`
- `lowest_heart_rate`
- `total_sleep_duration`

For each metric the snapshot stores a median plus ordinary low/high bounds. The implementation uses quartiles for the
ordinary range, then treats at least two same-day out-of-range baseline metrics as a baseline-only alert.

## Skill Integration

The OpenClaw skill does not reimplement business logic. It invokes `ouraclaw-cli` directly, defaults to one command per
execution, prefers JSON for automation, and uses `--text` only when it needs a sendable recap string.
