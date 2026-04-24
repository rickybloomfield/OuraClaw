# Migrating from the Old OpenClaw Plugin

If you previously used the old `ouraclaw` OpenClaw plugin, uninstall it first:

```bash
openclaw plugins uninstall ouraclaw
```

Restart the OpenClaw gateway if prompted.

Make sure the machine running the CLI is on Node.js 20 or newer.

Then install the standalone CLI:

```bash
npm install -g @robertvii/ouraclaw-cli
```

After installation, run either:

```bash
ouraclaw-cli auth status
```

or:

```bash
ouraclaw-cli setup
```

To replace old cron jobs with the new CLI-managed schedules, run:

```bash
ouraclaw-cli schedule setup
```

If old OuraClaw cron jobs or legacy plugin config are detected, the walkthrough can remove the old jobs and reuse the
old channel, target, timezone, and morning/evening times as defaults.

If you only want to remove the old cron jobs and import defaults without creating new ones yet, run:

```bash
ouraclaw-cli schedule migrate-from-ouraclaw-plugin
```

On first read, `ouraclaw-cli` imports compatible auth fields from the legacy plugin config at
`~/.openclaw/plugins/ouraclaw/config.json` if it exists. The old file is left untouched.

In practice this means the OpenClaw uninstall removes the old plugin registration from OpenClaw itself, while the CLI
can still reuse compatible auth data from the legacy plugin config during migration. Cron jobs are separate from plugin
uninstall, so existing users should still run `schedule setup` or `schedule migrate-from-ouraclaw-plugin` to clean up
old scheduled summaries.
