# Command Reference

## Invocation

```bash
ouraclaw-cli [global-options] <command> [command-options]
```

Runtime requirement: Node.js 20 or newer.

## Global Options

| Flag | Description |
|------|-------------|
| `-V, --version` | Show CLI version |
| `-h, --help` | Show help |

## Output Modes

- JSON is the default output for every command.
- `--text` is supported on `summary morning` and `summary evening`.
- `fetch` returns the raw Oura endpoint payload.

## Commands

### `ouraclaw-cli setup`

Interactive onboarding. Collects client credentials, runs OAuth, stores threshold and baseline defaults, and can
optionally hand off into the OpenClaw scheduling walkthrough when `openclaw` is available.

Setup always configures the standalone CLI first. If OpenClaw is unavailable, it skips OpenClaw scheduled delivery,
prints a short explanation before the JSON result, and returns `deliverySetup.reason: "openclaw_unavailable"`.

### `ouraclaw-cli auth login`

Runs the Oura OAuth login flow without changing thresholds, baseline tuning, or schedule settings. Use this when you
only need to re-authenticate.

### `ouraclaw-cli auth status`

Returns JSON describing whether auth is configured, whether the access token is expired, and whether refresh is
possible.

### `ouraclaw-cli auth refresh`

Uses the stored refresh token to fetch fresh tokens and rewrites local state.

### `ouraclaw-cli fetch <endpoint> [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]`

Fetches one Oura endpoint. Date handling rules:

- No dates: uses today for both start and end.
- One date: uses that same date for both start and end.
- Two dates: requires `start <= end`.

### `ouraclaw-cli baseline rebuild`

Rebuilds the baseline manually from the previous 21 days excluding today.

### `ouraclaw-cli baseline show`

Prints the stored baseline snapshot or `null` if none exists.

### `ouraclaw-cli config get [key]`

Prints all config/state fields or a specific key. Useful keys include:

- `thresholds.sleepScoreMin`
- `thresholds.readinessScoreMin`
- `thresholds.temperatureDeviationMax`
- `baselineConfig.lowerPercentile`
- `baselineConfig.supportingMetricAlertCount`

### `ouraclaw-cli config set <key> <value>`

Updates a supported config key. Numeric threshold values are validated before writing state.

Useful schedule keys include:

- `schedule.deliveryLanguage`
- `schedule.timezone`
- `schedule.optimizedWatcherDeliveryMode`

### `ouraclaw-cli schedule setup`

Interactive scheduler walkthrough. Detects legacy OuraClaw config and cron jobs, asks for delivery channel/target,
delivery language, timezone, which schedules to enable, and the optimized watcher delivery mode, then creates or
replaces the managed OpenClaw cron jobs.

### `ouraclaw-cli schedule status`

Prints JSON describing stored schedule config, whether `openclaw` is available, whether matching managed cron jobs
currently exist, and whether legacy OuraClaw cron jobs are still present.

### `ouraclaw-cli schedule disable`

Removes all CLI-managed OpenClaw cron jobs and marks scheduling as disabled without touching auth or summary state.

### `ouraclaw-cli schedule migrate-from-ouraclaw-plugin`

Inspects the old OuraClaw plugin config and known legacy cron jobs, removes the old cron jobs, and imports useful
schedule defaults into current CLI state without creating new jobs.

### `ouraclaw-cli summary morning`

Builds the standard morning recap. Default output is JSON; `--text` prints the sendable message directly.

### `ouraclaw-cli summary morning-optimized [--delivery-mode unusual-only|daily-when-ready]`

Returns JSON for the optimized alerting flow. The result includes `dataReady`, `shouldAlert`, `shouldSend`, optional
`deliveryKey`, `deliveryMode`, optional `deliveryType`, `today`, optional `baseline`, `alertMetrics`, `alertReasons`,
`skipReasons`, and `metricSignals`.

In `daily-when-ready` mode, a ready day without an alert can still return `shouldSend: true` with
`deliveryType: "morning-summary"` plus a nested `morningSummary` payload. `metricSignals` remains populated so the
sender can display all six metrics and mark worse-than-baseline values.

### `ouraclaw-cli summary week-overview [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]`

Builds a seven-day JSON overview using the same attention logic as `summary morning-optimized`. With no flags, the
range is the last seven days including today. With only `--start-date`, the range is that date plus the next six days.
With only `--end-date`, the range is that date and the previous six days. With both flags, the inclusive range must be
exactly seven days.

The result includes `period`, `baselineStatus`, `overview`, and `days`. Each day includes a concise `summaryLine`,
`dataReady`, `shouldAlert`, `alertMetrics`, `alertReasons`, `skipReasons`, and all six optimized metrics with value,
unit, baseline bounds when available, attention state, direction, severity, and reasons.

### `ouraclaw-cli summary morning-optimized-confirm --delivery-key <deliveryKey> [--delivery-mode unusual-only|daily-when-ready]`

Confirms that an optimized morning alert was actually delivered. This stores same-day delivery state so later
`summary morning-optimized` runs can suppress duplicates for the rest of the day.

### `ouraclaw-cli summary evening`

Builds the standard evening recap. Default output is JSON; `--text` prints the sendable message directly.
