# Optimized Morning Routine

`summary morning-optimized` is the quiet-by-default morning alert flow. It is designed to answer one question: "Is
today's Oura data unusual enough that I should actually interrupt the user?"

## What It Checks

The routine evaluates six morning decision metrics:

- `sleepScore`
- `readinessScore`
- `temperatureDeviation`
- `averageHrv`
- `lowestHeartRate`
- `totalSleepDuration`

The first three metrics have two ways to count as breached:

- fixed threshold breach
- personal baseline breach

The last three metrics count as breached only through the personal baseline.

## Fixed Thresholds

Fixed thresholds are **user configurable** absolute rules stored in CLI state. Defaults are:

- sleep score minimum: `75`
- readiness score minimum: `75`
- maximum absolute temperature deviation: `0.1`

If a metric crosses one of those hard limits, it is considered breached even if the user's historical baseline would
otherwise consider it ordinary.

## Personal Baseline

The baseline is built from the last three completed calendar weeks when `summary morning-optimized` refreshes
automatically, or from the previous 21 days excluding today when the user runs `baseline rebuild`.

For each tracked metric, the CLI stores:

- `median`
- `low`
- `high`
- `sampleSize`

`low` and `high` are controlled by the configured lower percentile and its mirrored upper percentile.

Examples:

- lower percentile `10` => ordinary band is 10th to 90th percentile, so breaches are rarer
- lower percentile `25` => ordinary band is 25th to 75th percentile, a balanced default
- lower percentile `40` => ordinary band is 40th to 60th percentile, so breaches are much easier to trigger

A same-day metric value is considered baseline-breached when it is below `low` or above `high`.

## Breach Counting

The routine counts unique breached metrics, not raw reasons. This matters because a metric such as `sleepScore` can be
breached by both a fixed threshold and the baseline band at the same time, but it still counts as one breached metric.

The baseline breach metric count is configurable and defaults to `1`.

That means:

- with `1`, a single breached metric is enough for the baseline path to count
- with `2`, the routine requires at least two unique breached metrics before the baseline path counts

Fixed-threshold breaches still matter even if the baseline breach metric count is higher.

## `dataReady`

If today's `daily_sleep.score`, `daily_readiness.score`, or `daily_readiness.temperature_deviation` is missing, the CLI
returns `dataReady: false` and `shouldSend: false`.

The OpenClaw skill should treat that as "do not send anything yet." The next scheduled run can simply evaluate again.

## Daily Delivery Mode

The optimized watcher is not only for quiet alerting.

If you configure the watcher in `daily-when-ready` mode, it still waits for today's Oura data to be ready before
sending anything. On unusual days it sends the optimized alert. On ordinary days it can still send a normal morning
recap, but only after real same-day data is available.

That makes it a better fit than a fixed-time morning cron job when the user wants a daily recap without the risk of
firing before Oura has synced yet.

`breachedMetrics` still remains part of the JSON contract in this mode:

- ordinary ready day => `breachedMetrics: []`
- unusual ready day => `breachedMetrics` contains the breached metrics exactly as in alert-only mode

## Delivery Handshake

If `summary morning-optimized` returns `shouldSend: true`, it also returns a `deliveryKey`.

The intended sequence is:

1. Agent runs `ouraclaw-cli summary morning-optimized`
2. If `shouldSend: true`, agent sends the message
3. Only after successful delivery, agent runs:

   `ouraclaw-cli summary morning-optimized-confirm --delivery-key <deliveryKey>`

   If the original result used `--delivery-mode daily-when-ready`, confirm with:

   `ouraclaw-cli summary morning-optimized-confirm --delivery-mode daily-when-ready --delivery-key <deliveryKey>`

This confirmation matters because the CLI does not know whether the external send actually succeeded. Once confirmation
is stored, later same-day runs return `shouldSend: false` with `already_delivered_today` so duplicate alerts are
suppressed.
