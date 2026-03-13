---
name: oura
description: Oura Ring sleep, readiness, activity, stress, and automated recap access through `oura-cli-p`.
homepage: https://github.com/robert7/oura-cli-p
metadata:
  {
    "openclaw":
      {
        "emoji": "🫧",
        "requires": { "bins": ["oura-cli-p"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "oura-cli-p",
              "bins": ["oura-cli-p"],
              "label": "Install oura-cli-p (npm)",
            },
          ],
      },
  }
---

# Oura via oura-cli-p

Use this skill when the user wants Oura Ring data, a morning recap, an evening recap, or an optimized morning alerting
decision.

## Preconditions

1. `oura-cli-p` is installed on the same machine as OpenClaw.
2. `oura-cli-p setup` has already completed successfully.
3. If setup has not completed, stop and ask the user to run `oura-cli-p setup`.

## Command Invocation Rule

- Run exactly one `oura-cli-p` command per execution.
- Invoke `oura-cli-p` directly.
- Do not chain commands with `&&`, `|`, `;`, subshells, or command substitution.
- Prefer the exact command forms documented below so OpenClaw allowlisting stays simple.

## Output Rule

- JSON is the default output for all commands.
- Use JSON when the command result needs machine reasoning or a formatted channel message.
- For scheduled summaries and optimized alerts, use the JSON output and compose the final channel message from the
  template in this skill.

## Common Commands

- Health check: `oura-cli-p auth status`
- Raw endpoint fetch:
  - `oura-cli-p fetch daily_sleep`
  - `oura-cli-p fetch sleep --start-date 2026-03-12 --end-date 2026-03-13`
- Manual baseline rebuild: `oura-cli-p baseline rebuild`
- Morning recap data: `oura-cli-p summary morning`
- Evening recap data: `oura-cli-p summary evening`
- Morning optimized decision: `oura-cli-p summary morning-optimized`

## Date Rules

- `fetch` defaults to today's date when no date flags are provided.
- If you need today's detailed sleep period, fetch `sleep` over yesterday -> today and then use the record whose `day`
  equals today, preferring `type="long_sleep"` if multiple records are returned.

## Formatting Guidelines

- Use concise bullet points, not long paragraphs.
- Lead with scores and labels.
- Include 2-3 key details per category.
- Convert durations from seconds to `Xh Ym` where needed.
- Keep summaries scannable because the user may be reading on a phone.
- Adapt formatting to the delivery channel using the guide below.

## Channel Formatting Guide

Different messaging channels support different formatting syntax. Use the correct format for the delivery channel. When
the channel is unknown or `default`, use plain text formatting.

### Plain text — iMessage (bluebubbles), Signal

No text-based formatting syntax is supported. Characters like `*`, `_`, and `~` appear literally.

- Use whitespace for visual structure.
- Use UPPERCASE sparingly for emphasis if needed.
- URLs are auto-linked, so include them as plain text.
- Use `|` or `·` as inline separators.
- Use `—` for inline breaks if helpful.

### WhatsApp

- **Bold**: `*text*`
- **Italic**: `_text_`
- **Strikethrough**: `~text~`
- **Inline code**: `` `text` ``
- **Lists**: `- item` at the start of a line
- URLs are auto-linked; do not use markdown link syntax `[text](url)`

### Telegram

Supports Markdown-style formatting:

- **Bold**: `*text*`
- **Italic**: `_text_`
- **Underline**: `__text__`
- **Strikethrough**: `~text~`
- **Links**: `[display text](url)`
- Escape special characters (`.`, `-`, `(`, `)`, `!`, etc.) with `\` when they appear outside formatting

### Slack

Uses Slack's mrkdwn syntax:

- **Bold**: `*text*`
- **Italic**: `_text_`
- **Strikethrough**: `~text~`
- **Links**: `<url|display text>`
- **Lists**: `- item` or `• item`
- Do not use standard Markdown bold (`**text**`) or link syntax (`[text](url)`)

### Discord

Uses standard Markdown:

- **Bold**: `**text**`
- **Italic**: `*text*`
- **Underline**: `__text__`
- **Strikethrough**: `~~text~~`
- **Links**: `[display text](url)`
- **Lists**: `- item`
- **Headers**: `#`, `##`, `###` at the start of a line

### WebChat / Default

Use standard Markdown formatting.

## Scheduled Summary Delivery

When producing a scheduled summary or alert, follow these rules:

- Read the template carefully and follow every format rule, including all specified data points, line counts, and
  examples.
- Run the appropriate `oura-cli-p` command in JSON mode and use that JSON as the source of truth for the final message.
- Send the complete formatted summary as a single message to the channel and target specified in the request. Do not
  summarize, abbreviate, or rephrase the final message after composing it.
- Follow the request's delivery language for any channel message. If the request specifies Slovak, English, or any
  other language, use that language for all user-visible text in the delivered message.
- Treat examples in this skill as structure-only unless the request says otherwise. An English example does not
  authorize sending the real channel message in English.
- Apply channel-appropriate formatting using the Channel Formatting Guide above based on the channel specified in the
  request.

## Morning Summary Template

When delivering a standard morning summary, run:

`oura-cli-p summary morning`

Use the returned JSON fields `day`, `dailySleep`, `dailyReadiness`, `dailyActivity`, `dailyStress`, `sleepRecord`, and
`missing` as the source data. Do not fall back to yesterday's data. If required fields are missing or pending, reflect
that plainly instead of inventing substitute values.

Send only the formatted summary in the delivery language, with no extra preamble or commentary.

Format rules:

- Start with "Good morning!" and today's date in the delivery language.
- **Sleep**: score with label, total sleep time, and key overnight details. From `sleepRecord`, include lowest resting
  heart rate, average overnight heart rate, average HRV, and deep/REM/light durations when available.
- **Readiness**: score with label, body temperature deviation, and the most relevant contributor context when available.
- **Activity**: use today's `dailyActivity` only. If activity is missing or pending, say so directly.
- **Stress**: mention the current summary when available. If stress data is missing, say so briefly or skip it.
- Keep it concise, roughly 8-10 lines max.
- Bold category labels and scores on channels that support bold. On plain text channels, do not use formatting markers.
- Do not include a "Dive deeper in the Oura app" closing line.

Example tone (plain text, structure only):

```text
Good morning! Here's your recap for Monday, Jan 27.

Sleep: 82 (Good) — 7h 12m total
Deep 58m | REM 1h 24m | Light 4h 50m
Lowest HR 52 bpm | Avg HR 58 bpm | HRV 42 ms

Readiness: 78 (Good)
Body temp +0.1C | Recovery slightly below usual

Activity: 74 (Good) — 8,241 steps, 312 active cal
Stress: normal range
```

## Evening Summary Template

When delivering a standard evening summary, run:

`oura-cli-p summary evening`

Use the returned JSON fields `day`, `dailyActivity`, `dailyReadiness`, `dailyStress`, `dailySleep`, and `missing` as
the source data. Do not fall back to yesterday's data.

Send only the formatted summary in the delivery language, with no extra preamble or commentary.

Format rules:

- Start with "Good evening!" and today's date in the delivery language.
- Focus on today's **activity**: score, steps, active calories, and total calories. If activity is missing or pending,
  say so directly rather than substituting another day.
- Include today's **readiness** and **stress**.
- Briefly mention last night's sleep score as a one-line recap.
- End with a short, genuine wind-down nudge in the delivery language.
- Keep it concise, roughly 6-8 lines max.
- Bold category labels and scores on channels that support bold. On plain text channels, do not use formatting markers.
- Do not include a "Dive deeper in the Oura app" closing line.

Example tone (plain text, structure only):

```text
Good evening! Here's your day in review for Monday, Jan 27.

Activity: 81 (Good) — 9,432 steps, 387 active cal, 2,145 total cal
Readiness: 78 (Good) | Stress: normal range
Last night's sleep: 82 (Good)

Nice active day. Wind down soon and set tomorrow up properly.
```

## Morning Optimized Template

When deciding whether a morning alert should be sent, run:

`oura-cli-p summary morning-optimized`

Interpret the JSON result as the source of truth:

- If `dataReady` is `false`, do not send a message.
- If `ordinary` is `true`, do not send a message.
- If `shouldSend` is `false`, do not send a message.
- If `shouldSend` is `true`, compose the final channel message from this template in the delivery language using
  `today`, `baseline`, `baselineStatus`, and `reasons`.
- If `baselineStatus` is `"refresh_failed"`, trust the CLI decision anyway; it already fell back to fixed thresholds.

Send only the formatted alert, with no extra preamble or commentary.

Alert format rules:

- Start with a brief morning greeting and today's date in the delivery language.
- Explain briefly that today's Oura data looks outside the usual morning range.
- **Sleep**: include sleep score with label and total sleep context when available.
- **Readiness**: include readiness score with label and temperature deviation.
- If baseline reasoning contributed, mention it briefly in plain language using the provided `reasons`.
- Keep it concise, roughly 5-8 lines max.
- Bold category labels and scores on channels that support bold. On plain text channels, do not use formatting markers.
- Treat the CLI `message` field as fallback context only; do not send it verbatim when this template can be filled from
  JSON.

Example tone (plain text, structure only):

```text
Good morning! Here's your Oura check for Monday, Jan 27.

Today's data looks a bit outside your usual range.

Sleep: 72 (Good)
Readiness: 68 (Fair) | Body temp +0.2C

Recent baseline also looks worse than your usual HRV or sleep range.

Worth taking today a bit gentler if you can.
```

## Ad-hoc Query Mapping

- "How did I sleep?" -> `oura-cli-p fetch daily_sleep`
- "Show detailed sleep" -> `oura-cli-p fetch sleep --start-date <yesterday> --end-date <today>`
- "What's my readiness?" -> `oura-cli-p fetch daily_readiness`
- "How active was I today?" -> `oura-cli-p fetch daily_activity`
- "How stressed was I?" -> `oura-cli-p fetch daily_stress`

Do not recreate Oura business logic in prompt text when the CLI already exposes it.
