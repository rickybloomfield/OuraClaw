# Scheduling

`ouraclaw-cli` can manage OpenClaw cron jobs for the packaged Oura skill, so users do not need to wire scheduled
messages by hand.

## Supported Schedule Types

- morning summary watcher over a single check or repeated morning window
- evening recap at one fixed time
- weekly overview at one fixed weekday and time

The morning summary watcher exists because Oura data does not always sync at the same time. Instead of guessing one
perfect morning trigger, the watcher can check multiple times, for example every hour from `08:00` through `13:00`,
and send the summary as soon as data is ready and the morning routine decides it should send.

That same watcher also works well for users who want a morning message every day. Instead of sending at a fixed clock
time before Oura has finished syncing, it can wait for real same-day data and then send once the data is ready. Set
the same start and end time if you want a single morning check.

## Setup

Run:

```bash
ouraclaw-cli schedule setup
```

The walkthrough:

1. Detects whether `openclaw` is installed.
2. Detects legacy OuraClaw plugin config and old cron jobs.
3. Loads configured OpenClaw chat targets when possible so you can pick a known channel quickly.
4. If the chosen channel already has known targets, offers them as shortcuts and still lets you enter a different
   target manually. This is useful for channels like Discord where you may want a different channel ID than the saved
   default.
5. Asks for delivery language. Default is `English`.
6. Asks which schedule types to enable.
7. For the weekly overview, asks which weekday and time should deliver the recap.
8. For the morning summary watcher, asks whether it should:
   - alert only when attention is needed
   - send every day once today's Oura data is ready
9. Asks for timezone and schedule times.
10. Creates or replaces the managed OpenClaw cron jobs.
11. Optionally removes old OuraClaw plugin cron jobs during the same walkthrough.

## Delivery Language

Scheduled jobs store a delivery language in CLI state and inject it into the cron prompt for the Oura skill. This means
you can keep the default `English` or choose another language such as `Slovak` without rewriting prompts by hand.

## Morning Summary Watcher Behavior

The morning summary watcher runs `summary morning` repeatedly inside the configured window.

- If `dataReady` is `false`, nothing is sent and the agent should produce no output at all.
- In `Alert only when attention is needed` mode:
  - `shouldSend: false` means nothing is sent and no skip/diagnostic message should be posted.
  - `shouldSend: true` sends the morning summary with alert emphasis.
- In `Send every day once today's Oura data is ready` mode:
  - `shouldSend: false` still means nothing is sent because data is not ready, and no skip/diagnostic message should be posted.
  - `shouldSend: true` sends the same morning summary contract on both calm and attention days. Calm days use neutral
    wording; attention days use stronger alert wording.
- After a successful send, the agent confirms delivery with
  `ouraclaw-cli summary morning-confirm --delivery-key <deliveryKey>`.

That confirmation matters because it lets later watcher runs on the same day suppress duplicates cleanly.

## Weekly Overview Behavior

The weekly overview is a single weekly cron job. It runs `summary week-overview` using the completed-day recap
contract, so a Monday job can cover the previous Monday through Sunday while still including the finished Sunday-night
sleep on the Sunday row.

Use a weekly overview when the main goal is one concise recap of the previous week, not a same-day watcher flow.

## Single Check vs Morning Window

Use a single morning check when the most important thing is one specific time.

Use the repeated morning window when the most important thing is using real same-day Oura data:

- it can notify as soon as Oura syncs
- it avoids firing too early when today's data is still missing
- it can still be configured for daily delivery, not only attention alerts

## Status and Disable

Inspect the stored scheduler state and current OpenClaw cron presence with:

```bash
ouraclaw-cli schedule status
```

Disable all CLI-managed jobs with:

```bash
ouraclaw-cli schedule disable
```

This removes CLI-managed cron jobs but keeps the rest of your CLI configuration.

## Migrating from the Old Plugin

If you previously used the old OpenClaw plugin, `schedule setup` can remove the old cron jobs for you when it detects
them. If you want a separate cleanup step first, run:

```bash
ouraclaw-cli schedule migrate-from-ouraclaw-plugin
```

That command removes known old OuraClaw cron jobs and imports useful schedule defaults into current CLI state without
creating new cron jobs yet.
