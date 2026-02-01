# OuraClaw

Oura Ring plugin and skill for [OpenClaw](https://github.com/nickarora/openclaw). Brings your sleep, readiness, activity, and stress data into your agent conversations.

## Features

- **Agent tool** (`oura_data`) — lets the agent fetch Oura Ring data on your behalf
- **Skill** — teaches the agent how to interpret scores, format summaries, and answer health questions
- **Scheduled summaries** — optional morning and evening health recaps delivered to your preferred channel
- **Background token refresh** — keeps your Oura connection alive without manual intervention

## Prerequisites

- [OpenClaw](https://github.com/nickarora/openclaw) installed and configured
- An [Oura Ring](https://ouraring.com) account with data

## Installation

```bash
# From ClawHub
clawhub install ouraclaw

# Or from npm
npm install @ouraclaw/ouraclaw

# Or from source
git clone https://github.com/your-username/ouraclaw.git
openclaw plugins install ./ouraclaw
```

## Setup

Run the interactive setup wizard:

```bash
openclaw ouraclaw setup
```

The wizard will walk you through:

1. **Create an Oura application**
   - Go to [https://cloud.ouraring.com](https://cloud.ouraring.com)
   - Navigate to "My Applications" and create a new app
   - Set the redirect URI to `http://localhost:9876/callback`

2. **Enter credentials** — paste your Client ID and Client Secret

3. **Authorize** — a browser window opens to complete the OAuth flow

4. **Choose delivery channel** — pick iMessage, Slack, Discord, Telegram, or use the default active channel

5. **Set schedule** — configure morning and evening summary times and timezone, or skip scheduled messages

## Usage

Once set up, just ask your agent about your health data:

- "How did I sleep last night?"
- "What's my readiness score?"
- "How active was I today?"
- "Show me my sleep trends for the past week"
- "Give me a full health summary"

## CLI Commands

```bash
openclaw ouraclaw setup    # Run the setup wizard
openclaw ouraclaw status   # Show connection status and config
openclaw ouraclaw test     # Fetch today's data to verify the connection
```

## Scheduled Summaries

If enabled during setup, OuraClaw creates two cron jobs:

- **Morning** (default 7:00 AM) — sleep score, readiness, stress, and a personalized note
- **Evening** (default 9:00 PM) — activity summary, readiness, stress, sleep recap, and a wind-down note

Manage them with:

```bash
openclaw cron list                              # See all cron jobs
openclaw cron run ouraclaw-morning --force      # Manually trigger morning summary
```

Re-running `openclaw ouraclaw setup` replaces existing cron jobs without duplication.

## Development

```bash
npm install
npm run build     # Compile TypeScript
npm run dev       # Watch mode
```

## License

MIT
