# Troubleshooting

## Install Fails or the CLI Will Not Start

- Confirm you are running Node.js 20 or newer.
- Reinstall dependencies or the global package after switching Node versions.
- Run `ouraclaw-cli --version` to verify the binary is reachable after installation.

## OAuth Times Out

- Confirm your Oura application redirect URI is exactly `http://localhost:9876/callback`.
- If you are running over SSH or another headless session, the CLI uses a conservative browser-open prompt default and
  can print the authorize URL instead. Open that URL manually in a browser on the same machine that can reach the
  local callback.
- On Linux or WSL, set `BROWSER` before running `ouraclaw-cli setup` if the default browser opener picks the wrong
  application.
- Re-run `ouraclaw-cli setup`.
- Ensure nothing else is already listening on port `9876`.

## OAuth Shows `400 invalid_request`

Oura usually returns this when the registered redirect URI does not match the authorize request exactly. Use
`http://localhost:9876/callback`, not `http://127.0.0.1:9876/callback`.

## OAuth State Validation Fails

The browser callback did not match the initiating request. Close the browser tab and run `ouraclaw-cli setup` again.
If your browser or desktop environment sends extra callback probes before the real redirect lands, the CLI now keeps
waiting for the authorization response instead of aborting early.

## `summary morning` Says Data Is Not Ready

The command requires today's `daily_sleep.score`, `daily_readiness.score`, and
`daily_readiness.temperature_deviation`. Wait until Oura has processed the day and retry.

## `summary morning` Says `already_delivered_today`

A morning summary delivery was already confirmed as delivered for today. This is expected duplicate suppression. The
CLI will not recommend another send until the next calendar day.

## Baseline Refresh Failed

The command still falls back to fixed thresholds and returns `baselineStatus: "refresh_failed"`. Check Oura API access
with `ouraclaw-cli fetch sleep --start-date <yesterday> --end-date <today>` and rerun later.

## `morning-confirm` Rejects the Delivery Key

The key must come from the current sendable result of `summary morning`, and confirmation should happen only after the
agent actually delivered the message. Re-run `ouraclaw-cli summary morning` to get a fresh
`deliveryKey` if the original decision is no longer valid.

## OpenClaw Cannot Run the Skill

- Install `ouraclaw-cli` on the same machine as OpenClaw.
- Ensure that machine is running Node.js 20 or newer.
- Ensure the binary is on `PATH`.
- Keep the skill command allowlist broad enough for the documented invocations in `skills/oura/SKILL.md`.
