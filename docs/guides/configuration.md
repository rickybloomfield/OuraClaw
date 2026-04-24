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
- supporting metric alert count: `2`

Lower percentile controls how wide the personal normal band is. `10` is wide and quieter, `25` is the balanced default,
and `40` is narrow and much more sensitive. A lower percentile of `25` means the normal band runs from the 25th to 75th
percentile of the baseline data. Supporting metric alert count controls how many worse supporting baseline signals are
needed before the optimized routine sends an alert. Primary metrics can alert by themselves.

## Baseline Snapshot

The baseline snapshot stores metadata about its source window plus per-metric bounds for:

- `sleepScore`
- `readinessScore`
- `temperatureDeviation`
- `average_hrv`
- `lowest_heart_rate`
- `total_sleep_duration`

Automatic baseline refresh is attempted only by `summary morning`.

## Scheduling

Schedule state is also stored in the local CLI JSON file. The scheduler section includes:

- delivery channel and target
- delivery language, default `English`
- timezone
- enabled status for the morning summary watcher, evening recap, and weekly overview
- morning summary delivery mode:
  - `unusual-only`
  - `daily-when-ready`
- morning summary start time, end time, and interval minutes
- weekly overview day and time
- stored OpenClaw cron job IDs

Use `ouraclaw-cli schedule setup` to configure or update these values. `schedule status` prints the current state plus
whether matching OpenClaw cron jobs still exist.

The morning summary watcher can store multiple cron job IDs when the requested window and interval need more than one cron
expression to stay inside the requested time range cleanly.

## Migration

On first read the CLI imports compatible auth fields from the legacy OpenClaw plugin config if it exists. The old file
is left untouched. For the full plugin-to-CLI migration flow, including old cron job cleanup and schedule replacement,
see the [Migration Guide](migrating-from-openclaw-plugin.md) and the [Scheduling Guide](scheduling.md).
