# Configuration

`ouraclaw-cli` stores state in `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.

## Fixed Thresholds

The setup wizard seeds these defaults:

- sleep score minimum: `75`
- readiness score minimum: `75`
- maximum absolute temperature deviation: `0.1`

These thresholds are CLI-owned configuration, not skill-owned prompt text. Adjust them with `config set`.

## Baseline Snapshot

The baseline snapshot stores metadata about its source window plus per-metric bounds for:

- `average_hrv`
- `lowest_heart_rate`
- `total_sleep_duration`

Automatic baseline refresh is attempted only by `summary morning-optimized`.

## Migration

On first read the CLI imports compatible auth fields from the legacy OpenClaw plugin config if it exists. The old file
is left untouched.
