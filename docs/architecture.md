# Architecture

`ouraclaw-cli` keeps Oura automation logic in one TypeScript CLI instead of splitting behavior between an OpenClaw plugin,
prompt templates, and shell glue. OpenClaw is one supported integration, but the CLI is designed to stay useful on its
own for any automation layer that can run commands and consume JSON.

The core runtime has four responsibilities:

1. Authentication and token refresh against the Oura OAuth endpoints.
2. Private local state storage at `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.
3. Oura API fetches plus summary and baseline evaluation.
4. A thin optional OpenClaw integration layer through the shipped skill in `skills/oura/`.

## State Model

The state file stores:

- schema version
- Oura client credentials and tokens
- fixed threshold configuration
- baseline tuning configuration
- schedule configuration for channel, target, delivery language, timezone, enabled job types, and stored OpenClaw cron
  job IDs
- baseline snapshot metadata and metric bounds
- confirmed morning delivery state

The CLI creates the parent directory with private permissions and rewrites the file with private permissions after each
state change. On first read it also checks for the legacy OpenClaw plugin config at
`~/.openclaw/plugins/ouraclaw/config.json` and imports compatible auth fields without deleting the old file.

## OAuth

OAuth uses the registered redirect URI `http://localhost:9876/callback`, because Oura validates redirect URIs exactly.
The local callback server still binds only to `127.0.0.1:9876`, so the browser round-trip stays on the loopback
interface. The authorize URL includes a random `state` token. The callback handler rejects missing or mismatched state
values, closes cleanly on timeout, and writes tokens only after a successful token exchange.

## Baseline Policy

`summary morning` can refresh the stored baseline automatically when none exists or when the snapshot is more
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
percentile. A same-day value outside that band becomes a direction-aware metric signal.

The morning summary routine combines fixed thresholds and baseline attention signals. Fixed-threshold failures alert
immediately. For baseline signals, `sleepScore`, `readinessScore`, and `totalSleepDuration` are primary metrics: a
worse value on any one of them alerts by itself. `temperatureDeviation`, `averageHrv`, and `lowestHeartRate` are
supporting metrics: they can be worse than baseline without being marked as actionable attention. They are only marked
for attention when they actually contribute to a real alert via the configured supporting metric alert count. Higher
HRV and lower resting heart rate are treated as better baseline signals, not alert causes.

Once an agent has successfully delivered a morning summary, it must confirm delivery back to the CLI with the returned
`deliveryKey`. The CLI stores that confirmation in local state and suppresses duplicate same-day morning sends for the
rest of the calendar day.

## Skill Integration

The OpenClaw skill does not reimplement business logic. It invokes `ouraclaw-cli` directly, defaults to one command per
execution, prefers JSON for automation, and uses `--text` only when it needs a sendable recap string.

The same JSON-first contract is intended to work equally well for non-OpenClaw automations. In addition to the daily
recap commands and morning summary decision, `summary week-overview` is a first-class structured output for concise
weekly recaps and localized agent rendering. That weekly view is calendar-day-oriented: by default it excludes today
and shifts each morning-style metric bundle back one day so the final row in a Monday recap can still include the
completed Sunday-night sleep.

## Scheduling

`ouraclaw-cli` can manage OpenClaw cron jobs directly through `schedule setup`, `schedule status`, `schedule disable`,
and `schedule migrate-from-ouraclaw-plugin`.

Two schedule types are supported:

- morning summary watcher
- fixed-time evening recap

The morning summary watcher is a repeated cron window rather than a single time, though users can set the same start
and end time for one morning check. It can run multiple times between a start and end time so the user can be notified
as soon as Oura data is ready. When the watcher interval cannot be expressed as a single cron expression without
drifting outside the requested window, the CLI stores multiple morning cron job IDs and manages them as one logical
schedule.

All managed schedules use the shipped Oura skill in `skills/oura/`, inject the configured delivery language, and direct
the agent to send to the configured OpenClaw channel and target. Morning summary jobs also instruct the agent to
confirm delivery only after a successful send.
