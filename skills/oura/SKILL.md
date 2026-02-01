---
name: oura
description: Oura Ring health data — sleep, readiness, activity, and stress
gatedOn: plugins.entries.ouraclaw.config.accessToken
---

# Oura Ring Health Data

You have access to the user's Oura Ring data through the `oura_data` tool. Use it to answer health questions and deliver scheduled summaries.

## Endpoint Reference

| Endpoint | Returns | Key Fields |
|----------|---------|------------|
| `daily_sleep` | Sleep score & contributors | `score`, `contributors.deep_sleep`, `.efficiency`, `.rem_sleep`, `.restfulness`, `.total_sleep` |
| `daily_readiness` | Readiness score & contributors | `score`, `contributors.hrv_balance`, `.resting_heart_rate`, `.recovery_index`, `.sleep_balance` |
| `daily_activity` | Activity score & metrics | `score`, `steps`, `active_calories`, `total_calories`, `high_activity_time`, `medium_activity_time` |
| `sleep` | Detailed sleep periods | `duration`, `total_sleep_duration`, `deep_sleep_duration`, `rem_sleep_duration`, `light_sleep_duration`, `efficiency`, `average_heart_rate`, `lowest_heart_rate`, `average_hrv`, `bedtime_start`, `bedtime_end` |
| `daily_stress` | Stress summary | `stress_high`, `recovery_high`, `day_summary` |

## Usage Instructions

- **Date defaults**: If no dates specified, the tool defaults to today's data. Use `start_date` and `end_date` in `YYYY-MM-DD` format for specific ranges.
- **Multi-endpoint queries**: For comprehensive answers, call multiple endpoints. E.g., "How did I sleep?" should fetch both `daily_sleep` (score) and `sleep` (details).
- **Duration conversion**: Sleep/activity durations are in **seconds**. Convert to hours and minutes: `27360s` → `7h 36m`.
- **Null values**: Some fields may be `null` if Oura hasn't computed them yet. Note this gracefully rather than showing "null".

## Score Interpretation

| Range | Label |
|-------|-------|
| 85+ | Excellent |
| 70–84 | Good |
| 60–69 | Fair |
| Below 60 | Needs attention |

## Formatting Guidelines

- Use concise bullet points, not long paragraphs
- Lead with scores and labels (e.g., "Sleep: 82 (Good)")
- Include 2–3 key contributor details per category
- Convert all durations from seconds to Xh Ym format
- Add brief, personalized context when relevant (e.g., "HRV is trending lower than usual")
- Keep summaries scannable — the user may be reading on a phone

## Morning Summary Template

When delivering a morning summary, fetch `daily_sleep`, `sleep`, `daily_readiness`, and `daily_stress` for today, then format as:

```
Good morning! Here's your overnight recap:

**Sleep: [score] ([label])**
- Total: [Xh Ym] | Efficiency: [X]%
- Deep: [Xh Ym] | REM: [Xh Ym] | Light: [Xh Ym]
- Avg HR: [X] bpm | Lowest: [X] bpm | Avg HRV: [X] ms
- Bedtime: [time] → [time]

**Readiness: [score] ([label])**
- HRV Balance: [X] | Resting HR: [X]
- Recovery Index: [X] | Sleep Balance: [X]

**Stress: [day_summary or stress_high/recovery_high summary]**

[One sentence personalized note based on the data — e.g., "Your deep sleep was strong last night. Consider a moderate workout today given your solid readiness score."]
```

## Evening Summary Template

When delivering an evening summary, fetch `daily_activity`, `daily_readiness`, `daily_stress`, and `daily_sleep` for today, then format as:

```
Good evening! Here's your day in review:

**Activity: [score] ([label])**
- Steps: [X] | Active calories: [X] kcal
- High activity: [Xh Ym] | Medium: [Xh Ym]

**Readiness: [score] ([label])**
- Key: [top 1–2 contributors or notable changes]

**Stress: [day_summary or stress_high/recovery_high summary]**

**Last Night's Sleep: [score] ([label])** (recap)
- Total: [Xh Ym] | Efficiency: [X]%

[One sentence wind-down note — e.g., "You hit your activity goals today. With readiness looking good, aim for your usual bedtime to keep the streak going."]
```

## Ad-hoc Query Mapping

Map natural language to endpoints:

| User says | Fetch |
|-----------|-------|
| "How did I sleep?" / "Sleep report" | `daily_sleep` + `sleep` |
| "Am I ready to work out?" / "Readiness" | `daily_readiness` |
| "How active was I?" / "Steps today" | `daily_activity` |
| "Stress levels" | `daily_stress` |
| "Full health summary" | All endpoints |
| "Last week's sleep" / "trends" | `daily_sleep` with 7-day date range |
| "Compare this week to last" | Two date ranges, summarize differences |

When the user asks about trends or comparisons, fetch the relevant date range and summarize the pattern (improving, declining, stable) with specific numbers.
