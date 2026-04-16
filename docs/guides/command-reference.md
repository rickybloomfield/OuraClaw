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
- `--text` is supported on `summary morning`, `summary week-overview`, and `summary evening`.
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
- `schedule.morningDeliveryMode`

### `ouraclaw-cli schedule setup`

Interactive scheduler walkthrough. Detects legacy OuraClaw config and cron jobs, asks for a delivery channel first,
offers known targets as shortcuts while still allowing manual target entry, then collects delivery language, timezone,
which schedules to enable, and the morning summary delivery mode before creating or replacing the managed OpenClaw cron
jobs.

### `ouraclaw-cli schedule status`

Prints JSON describing stored schedule config, whether `openclaw` is available, whether matching managed cron jobs
currently exist, and whether legacy OuraClaw cron jobs are still present.

### `ouraclaw-cli schedule disable`

Removes all CLI-managed OpenClaw cron jobs and marks scheduling as disabled without touching auth or summary state.

### `ouraclaw-cli schedule migrate-from-ouraclaw-plugin`

Inspects the old OuraClaw plugin config and known legacy cron jobs, removes the old cron jobs, and imports useful
schedule defaults into current CLI state without creating new jobs.

### `ouraclaw-cli summary morning [--delivery-mode unusual-only|daily-when-ready] [--text]`

Returns JSON for the canonical morning summary flow. The result includes `dataReady`, `shouldAlert`, `shouldSend`,
optional `deliveryKey`, `deliveryMode`, `today`, optional `baseline`, `alertMetrics`, `alertReasons`, `skipReasons`,
`metricSignals`, and optional `message` for sendable results. Within `metricSignals`, `attention: true` is reserved
for actionable metrics that actually contributed to `alertMetrics`.

In `daily-when-ready` mode, a ready day without an alert can still return `shouldSend: true` with a calm morning
summary message. The result shape stays the same on both calm and attention days; there is no separate morning
delivery type branch.

### `ouraclaw-cli summary week-overview [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--text]`

Builds a seven-day JSON overview using the same attention logic as `summary morning`. With no flags, the
range is the last seven completed calendar days, excluding today. With only `--start-date`, the range is that date
plus the next six days. With only `--end-date`, the range is that date and the previous six days. With both flags, the
inclusive range must be exactly seven days.

For weekly recap rendering, each row is labeled by the completed calendar day being reviewed. The underlying sleep,
readiness, temperature, HRV, heart-rate, and total-sleep bundle is shifted back one day from the morning-style Oura
record ownership, so a Monday run can show the previous Monday through Sunday while still including Sunday-night to
Monday-morning sleep on the Sunday row.

The result includes `period`, `baselineStatus`, `metricOrder`, `overview`, and `days`. Each day includes `weekday`,
`dataReady`, `shouldAlert`, a concise English fallback `summaryLine`, `attentionMetrics`, `missingMetrics`, compact
`metrics` entries with `key`, raw `value`, `unit`, localized-rendering helper `displayValue`, and `attention`, plus
completed-day `activity` and `stress` context. `summaryLine` omits missing values and prefixes only actionable
attention metrics with `⚠️`. For non-English summaries, render from `metricOrder`, `metrics`, and `attentionMetrics`
instead of translating `summaryLine`.

`overview` also includes step and stress rollups for the seven-day window:

- `totalSteps`
- `averageSteps`
- `topStressSummaries`

With `--text`, the command prints a compact English recap intended for local inspection: one header line, one line per
day with appended step and stress context when available, and an optional closing pattern note.

### `ouraclaw-cli summary morning-confirm --delivery-key <deliveryKey> [--delivery-mode unusual-only|daily-when-ready]`

Confirms that a morning summary delivery was actually delivered. This stores same-day delivery state so later
`summary morning` runs can suppress duplicates for the rest of the day.

### `ouraclaw-cli summary evening`

Builds the standard evening recap. Default output is JSON; `--text` prints the sendable message directly.
