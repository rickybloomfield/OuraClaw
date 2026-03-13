# Configuration

`ouraclaw-cli` stores state in `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.

## Fixed Thresholds

The setup wizard seeds these defaults:

- sleep score minimum: `75`
- readiness score minimum: `75`
- maximum absolute temperature deviation: `0.1`

These thresholds are CLI-owned configuration, not skill-owned prompt text. Adjust them with `config set`.

## Baseline Tuning

The setup wizard also stores baseline tuning separately from fixed thresholds:

- lower percentile: `25`
- breach metric count: `1`

Lower percentile controls how wide the personal ordinary band is. `10` is wide and quieter, `25` is the balanced
default, and `40` is narrow and much more sensitive. Breach metric count controls how many unique same-day metric
breaches are needed before the baseline path counts as triggered.

## Baseline Snapshot

The baseline snapshot stores metadata about its source window plus per-metric bounds for:

- `sleepScore`
- `readinessScore`
- `temperatureDeviation`
- `average_hrv`
- `lowest_heart_rate`
- `total_sleep_duration`

Automatic baseline refresh is attempted only by `summary morning-optimized`.

## Migration

On first read the CLI imports compatible auth fields from the legacy OpenClaw plugin config if it exists. The old file
is left untouched. For the full plugin-to-CLI migration flow, see the [Migration Guide](migrating-from-openclaw-plugin.md).
