# Morning Summary Routine

`summary morning` is the canonical morning summary flow. It is designed to answer two related questions:
"Is today's Oura data ready?" and "Does today's Oura data need attention?"

## What It Checks

The routine evaluates six morning decision metrics:

- `sleepScore`
- `readinessScore`
- `temperatureDeviation`
- `averageHrv`
- `lowestHeartRate`
- `totalSleepDuration`

The first three metrics can need attention through two paths:

- fixed threshold alert
- personal baseline attention signal

The last three metrics are evaluated through the personal baseline.

## Fixed Thresholds

Fixed thresholds are **user configurable** absolute rules stored in CLI state. Defaults are:

- sleep score minimum: `75`
- readiness score minimum: `75`
- maximum absolute temperature deviation: `0.1`

If a metric crosses one of those hard limits, it sets `shouldAlert: true` even if the user's historical baseline would
otherwise consider it normal.

## Personal Baseline

The baseline is built from the last three completed calendar weeks when `summary morning` refreshes
automatically, or from the previous 21 days excluding today when the user runs `baseline rebuild`.

For each tracked metric, the CLI stores:

- `median`
- `low`
- `high`
- `sampleSize`

`low` and `high` are controlled by the configured lower percentile and its mirrored upper percentile.

Examples:

- lower percentile `10` => ordinary band is 10th to 90th percentile, so baseline signals are rarer
- lower percentile `25` => ordinary band is 25th to 75th percentile, a balanced default
- lower percentile `40` => ordinary band is 40th to 60th percentile, so baseline signals are much easier to trigger

A same-day metric value outside `low` and `high` becomes a `metricSignals` entry. Whether that signal is better or
worse depends on the metric direction.

## Attention Logic

The routine is direction-aware. Better-than-baseline values are reported in `metricSignals`, but they do not set
`shouldAlert: true`.

Worse directions are:

- `sleepScore` below baseline
- `readinessScore` below baseline
- `totalSleepDuration` below baseline
- `averageHrv` below baseline
- `lowestHeartRate` above baseline
- `temperatureDeviation` outside baseline

The primary metrics are `sleepScore`, `readinessScore`, and `totalSleepDuration`. One worse primary metric sets
`shouldAlert: true`.

The supporting metrics are `temperatureDeviation`, `averageHrv`, and `lowestHeartRate`. Supporting metrics can still
appear in `metricSignals` as worse-than-baseline, but they are marked with `attention: true` only when they actually
contribute to `alertMetrics` on a real alert day. They set `shouldAlert: true` only when at least
`baselineConfig.supportingMetricAlertCount` supporting metrics are worse. The default is `2`.

Fixed-threshold alerts still set `shouldAlert: true` immediately.

## `dataReady`

If today's `daily_sleep.score`, `daily_readiness.score`, or `daily_readiness.temperature_deviation` is missing, the CLI
returns `dataReady: false`, `shouldAlert: false`, `shouldSend: false`, and `skipReasons`.

The OpenClaw skill should treat that as "do not send anything yet." The next scheduled run can simply evaluate again.

## Daily Delivery Mode

The morning summary watcher is not only for quiet alerting.

If you configure the watcher in `daily-when-ready` mode, it still waits for today's Oura data to be ready before
sending anything. On attention days it sends the morning summary with alert emphasis. On other days it can still send a
calm morning summary, but only after real same-day data is available.

That makes it a better fit than a fixed-time morning cron job when the user wants a daily recap without the risk of
firing before Oura has synced yet.

`metricSignals` remains part of the JSON contract in this mode:

- ready day without alert => `shouldAlert: false`, `alertMetrics: []`, and all available metrics in `metricSignals`
- ready day with alert => `shouldAlert: true`, `alertMetrics` contains the alert-driving metrics, and
  `metricSignals` still includes all available metrics

Within `metricSignals`, `attention: true` is reserved for actionable metrics that actually appear in `alertMetrics`.
Supporting metrics can still show `severity: "worse"` on calm days without being marked as attention.

## Weekly Context

The CLI also exposes `summary week-overview` as a separate seven-day JSON summary. It defaults to the last seven days
excluding today and is shaped for brief localized recaps: one concise daily line, explicit attention markers, and
structured per-metric fields for agent rendering. The weekly view treats each row as a completed calendar day, so it
shifts the morning-style metric bundle back by one day. That lets a Monday recap cover the previous Monday through
Sunday while still including Sunday-night to Monday-morning sleep on the Sunday row. Those attention markers follow the
same actionable rule as `summary morning`, so a supporting outlier does not get `⚠️` unless it helped drive the alert.

That weekly command is independent of the morning summary decision, but it is the intended input for future Monday
messages that combine the normal morning check with a quick look back at the previous week.

## Delivery Handshake

If `summary morning` returns `shouldSend: true`, it also returns a `deliveryKey`.

The intended sequence is:

1. Agent runs `ouraclaw-cli summary morning`
2. If `shouldSend: false`, agent sends nothing and produces no output at all.
3. If `shouldSend: true`, agent sends the single morning summary contract. Calm days use neutral wording; attention
   days mention the relevant alert reasons.
4. Only after successful delivery, agent runs:

   `ouraclaw-cli summary morning-confirm --delivery-key <deliveryKey>`

   If the original result used `--delivery-mode daily-when-ready`, confirm with:

   `ouraclaw-cli summary morning-confirm --delivery-mode daily-when-ready --delivery-key <deliveryKey>`

This confirmation matters because the CLI does not know whether the external send actually succeeded. Once confirmation
is stored, later same-day runs return `shouldSend: false` with `already_delivered_today` in `skipReasons` so duplicate alerts are
suppressed.
