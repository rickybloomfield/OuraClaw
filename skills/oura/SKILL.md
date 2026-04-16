---
name: oura
description: Oura Ring sleep, readiness, activity, stress, and automated recap access through `ouraclaw-cli`.
homepage: https://github.com/robert7/ouraclaw-cli
metadata:
  {
    "openclaw":
      {
        "emoji": "🫧",
        "requires": { "bins": ["ouraclaw-cli"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "@robertvii/ouraclaw-cli",
              "bins": ["ouraclaw-cli"],
              "label": "Install ouraclaw-cli (npm)",
            },
          ],
      },
  }
---

# Oura via ouraclaw-cli

Use this skill when the user wants Oura Ring data, a morning summary, an evening recap, or a weekly overview.

## Preconditions

1. `ouraclaw-cli` is installed on the same machine as OpenClaw.
2. `ouraclaw-cli setup` has already completed successfully.
3. If setup has not completed, stop and ask the user to run `ouraclaw-cli setup`.

## Command Invocation Rule

- Run exactly one `ouraclaw-cli` command per execution.
- Invoke `ouraclaw-cli` directly.
- Do not chain commands with `&&`, `|`, `;`, subshells, or command substitution.
- Prefer the exact command forms documented below so OpenClaw allowlisting stays simple.

## Output Rule

- JSON is the default output for all commands.
- Use JSON when the command result needs machine reasoning or a formatted channel message.
- For scheduled summaries and morning sends, use the JSON output and compose the final channel message from the
  template in this skill.

## Common Commands

- Health check: `ouraclaw-cli auth status`
- Raw endpoint fetch:
  - `ouraclaw-cli fetch daily_sleep`
  - `ouraclaw-cli fetch sleep --start-date 2026-03-12 --end-date 2026-03-13`
- Manual baseline rebuild: `ouraclaw-cli baseline rebuild`
- Morning summary data: `ouraclaw-cli summary morning`
- Evening recap data: `ouraclaw-cli summary evening`
- Morning delivery confirmation: `ouraclaw-cli summary morning-confirm --delivery-key <deliveryKey>`
- Seven-day overview: `ouraclaw-cli summary week-overview`
- Seven-day overview text preview: `ouraclaw-cli summary week-overview --text`

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
- For `summary week-overview`, prefer one line per day. Use `days[].metrics` in `metricOrder`, prefix metrics with
  `attention=true` using `⚠️`, and omit entries listed only in `missingMetrics`.

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
- Run the appropriate `ouraclaw-cli` command in JSON mode and use that JSON as the source of truth for the final message.
- Send the complete formatted summary as a single message to the channel and target specified in the request. Do not
  summarize, abbreviate, or rephrase the final message after composing it.
- Follow the request's delivery language for any channel message. If the request specifies Slovak, English, or any
  other language, use that language for all user-visible text in the delivered message.
- Treat examples in this skill as structure-only unless the request says otherwise. An English example does not
  authorize sending the real channel message in English.
- Apply channel-appropriate formatting using the Channel Formatting Guide above based on the channel specified in the
  request.

## Morning Summary Template

When deciding whether a morning summary should be sent, run:

`ouraclaw-cli summary morning`

For a watcher configured to send every day once today's data is ready, run:

`ouraclaw-cli summary morning --delivery-mode daily-when-ready`

Interpret the JSON result as the source of truth:

- If `dataReady` is `false`, send nothing and produce no output at all.
- If `shouldSend` is `false`, send nothing and produce no output at all. Do not post a status message, explanation,
  acknowledgment, or skip notice.
- If `shouldSend` is `true`, compose the final channel message from this template in the delivery language using
  `today`, `shouldAlert`, `baselineStatus`, `alertMetrics`, `alertReasons`, and `metricSignals`.
- If `baselineStatus` is `"refresh_failed"`, trust the CLI decision anyway; it already fell back to fixed thresholds.
- After the agent successfully delivers the summary, it must confirm delivery by running
  `ouraclaw-cli summary morning-confirm --delivery-key <deliveryKey>`.
- If the original command used `--delivery-mode daily-when-ready`, the confirmation command must use the same
  `--delivery-mode daily-when-ready`.
- Never confirm delivery if the send failed or was skipped.

Send only the formatted summary, with no extra preamble or commentary.

Format rules:

- Start with a brief morning greeting and today's date in the delivery language.
- If `shouldAlert` is `true`, explain briefly that today's Oura data has one or more metrics that need attention.
- If `shouldAlert` is `false`, use neutral daily-recap wording. Do not say the day needs attention.
- Show all six morning metrics when present: sleep score, readiness score, temperature deviation, HRV, lowest heart
  rate, and total sleep duration.
- Mark metrics where `metricSignals[].attention` is `true`. Use `⚠️` on WhatsApp, Telegram, Discord, Slack, and
  WebChat/default. Use `ATTENTION` on plain-text channels.
- Treat `severity: "better"` signals as positive or neutral context, not warnings.
- If baseline or fixed-threshold reasoning contributed, mention it briefly in plain language using `alertReasons`.
- Keep it concise, roughly 5-8 lines max.
- Bold category labels and scores on channels that support bold. On plain text channels, do not use formatting markers.
- Treat the CLI `message` field as fallback context only; do not send it verbatim when this template can be filled from
  JSON.

Example tone (plain text, structure only):

```text
Good morning! Here's your Oura summary for Monday, Jan 27.

Today's data looks a bit outside your usual range.

Sleep: ⚠️ 72 | Total 6h 15m
Readiness: ⚠️ 68 | Body temp +0.2C
HRV: 39 ms | Lowest HR: 52 bpm

Attention: sleep and readiness are below your usual morning range.
```

## Evening Summary Template

When delivering a standard evening summary, run:

`ouraclaw-cli summary evening`

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

Example tone (plain text, structure only):

```text
Good evening! Here's your day in review for Monday, Jan 27.

Activity: 81 (Good) — 9,432 steps, 387 active cal, 2,145 total cal
Readiness: 78 (Good) | Stress: normal range
Last night's sleep: 82 (Good)

Nice active day. Wind down soon and set tomorrow up properly.
```

## Week Overview Template

When delivering a seven-day overview, run:

`ouraclaw-cli summary week-overview`

Use the returned JSON fields `period`, `metricOrder`, `overview`, and `days` as the source data. For local inspection,
`ouraclaw-cli summary week-overview --text` prints a compact English preview of the same recap shape.

Interpret the range as completed calendar days. By default it excludes today, and each row already carries the
next-morning Oura bundle shifted back onto the completed day being reviewed.

Send only the formatted overview in the delivery language, with no extra preamble or commentary.

Format rules:

- Start with a short header covering the seven-day range in the delivery language.
- Then write one concise line per day, in chronological order.
- Build each daily line from `days[].metrics`, ordered by `metricOrder`.
- Add `activity.steps` and `stress.daySummary` when available because they reflect the completed calendar day.
- Use `days[].summaryLine` as English fallback context only. For non-English output, render from structured fields
  instead of translating `summaryLine` literally.
- Prefix attention metrics with `⚠️` on WhatsApp, Telegram, Discord, Slack, and WebChat/default. Use `ATTENTION` on
  plain-text channels.
- Omit metrics listed only in `missingMetrics`. If a whole day has no metrics, say briefly that data is not ready yet.
- Optionally add one short closing takeaway using `overview.attentionDays`, `overview.topAttentionMetrics`, or
  `overview.topStressSummaries`.
- Keep it concise, roughly 8-10 lines total.
- Bold only the header on channels that support bold. On plain text channels, do not use formatting markers.
- The example below is English structure only. The real delivered message must use the requested delivery language.

Example tone (plain text, structure only):

```text
Your Oura overview for Apr 4 – Apr 10.

Sat: Sleep 81 | Readiness 84 | Total 6h 28m | ⚠️ Temp +0.3C
Sun: Sleep 79 | ⚠️ Readiness 76 | Total 6h 05m | ⚠️ Lowest HR 55 bpm | ⚠️ HRV 30 ms
Mon: Sleep 88 | Readiness 87 | Total 7h 41m | Temp +0.0C | Lowest HR 50 bpm | HRV 42 ms
Tue: Sleep 85 | Readiness 80 | Total 6h 55m | ⚠️ Temp +0.2C | ⚠️ Lowest HR 64 bpm | HRV 18 ms
Wed: Sleep 86 | Readiness 85 | Total 7h 12m | Temp +0.1C | Lowest HR 61 bpm | HRV 20 ms
Thu: Sleep 83 | Readiness 82 | Total 6h 44m | ⚠️ Temp +0.2C | Lowest HR 62 bpm | HRV 19 ms | Steps 8.4k | Stress steady
Fri: Sleep 85 | Readiness 86 | Total 6h 52m | Temp +0.1C | Lowest HR 60 bpm | HRV 21 ms | Steps 9.1k | Stress relaxed

Main pattern: temperature was the most repeated attention signal this week.
```

## Ad-hoc Query Mapping

- "How did I sleep?" -> `ouraclaw-cli fetch daily_sleep`
- "Show detailed sleep" -> `ouraclaw-cli fetch sleep --start-date <yesterday> --end-date <today>`
- "What's my readiness?" -> `ouraclaw-cli fetch daily_readiness`
- "How active was I today?" -> `ouraclaw-cli fetch daily_activity`
- "How stressed was I?" -> `ouraclaw-cli fetch daily_stress`
- "How was my week?" -> `ouraclaw-cli summary week-overview`

Do not recreate Oura business logic in prompt text when the CLI already exposes it.
