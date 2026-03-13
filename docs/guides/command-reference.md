# Command Reference

## Invocation

```bash
ouraclaw-cli [global-options] <command> [command-options]
```

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

Interactive onboarding. Collects client credentials, runs OAuth, and stores initial threshold configuration.

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

### `ouraclaw-cli config set <key> <value>`

Updates a supported config key. Numeric threshold values are validated before writing state.

### `ouraclaw-cli summary morning`

Builds the standard morning recap. Default output is JSON; `--text` prints the sendable message directly.

### `ouraclaw-cli summary morning-optimized`

Returns JSON for the optimized alerting flow. The result includes `dataReady`, `ordinary`, `shouldSend`, `message`,
`today`, optional `baseline`, and ordered `reasons`.

### `ouraclaw-cli summary evening`

Builds the standard evening recap. Default output is JSON; `--text` prints the sendable message directly.
