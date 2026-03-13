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
- baseline tuning configuration
- baseline snapshot metadata and metric bounds
- confirmed optimized-morning delivery state

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

The stored baseline tracks these morning decision metrics when available:

- `sleep_score`
- `readiness_score`
- `temperature_deviation`
- `average_hrv`
- `lowest_heart_rate`
- `total_sleep_duration`

For each metric the snapshot stores a median plus ordinary low/high bounds. The ordinary band is configurable through a
lower percentile and its mirrored upper percentile. With the default `25`, the ordinary band is the 25th to 75th
percentile. A same-day value outside that band counts as a baseline breach for that metric.

The optimized morning routine combines fixed thresholds and baseline breaches. `sleepScore`, `readinessScore`, and
`temperatureDeviation` count as breached when they violate either their fixed threshold or their baseline band.
`averageHrv`, `lowestHeartRate`, and `totalSleepDuration` count as breached only through the baseline band. The number
of unique breached metrics required for the baseline path is configurable and defaults to `1`.

Once an agent has successfully delivered an optimized morning alert, it must confirm delivery back to the CLI with the
returned `deliveryKey`. The CLI stores that confirmation in local state and suppresses duplicate optimized-morning
alerts for the rest of the same calendar day.

## Skill Integration

The OpenClaw skill does not reimplement business logic. It invokes `ouraclaw-cli` directly, defaults to one command per
execution, prefers JSON for automation, and uses `--text` only when it needs a sendable recap string.
