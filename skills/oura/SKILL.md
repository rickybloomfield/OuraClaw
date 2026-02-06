---
name: oura
description: Oura Ring health data — sleep, readiness, activity, and stress
gatedOn: plugins.entries.ouraclaw.config.accessToken
---

# Oura Ring Health Data

You have access to the user's Oura Ring data through the `oura_data` tool. Use it to answer health questions and deliver scheduled summaries.

## Endpoint Reference

### Core (used in daily summaries)

| Endpoint | Returns | Key Fields |
|----------|---------|------------|
| `daily_sleep` | Sleep score & contributors | `score`, `contributors.deep_sleep`, `.efficiency`, `.rem_sleep`, `.restfulness`, `.total_sleep` |
| `daily_readiness` | Readiness score & contributors | `score`, `contributors.hrv_balance`, `.resting_heart_rate`, `.recovery_index`, `.sleep_balance` |
| `daily_activity` | Activity score & metrics | `score`, `steps`, `active_calories`, `total_calories`, `high_activity_time`, `medium_activity_time` |
| `sleep` | Detailed sleep periods | `duration`, `total_sleep_duration`, `deep_sleep_duration`, `rem_sleep_duration`, `light_sleep_duration`, `efficiency`, `average_heart_rate`, `lowest_heart_rate`, `average_hrv`, `bedtime_start`, `bedtime_end` |
| `daily_stress` | Stress summary | `stress_high`, `recovery_high`, `day_summary` |

### Additional (available for ad-hoc queries)

| Endpoint | Returns | Key Fields |
|----------|---------|------------|
| `heartrate` | Continuous heart rate samples | `bpm`, `source`, `timestamp` |
| `daily_spo2` | Blood oxygen levels | `spo2_percentage`, `breathing_disturbance_index` |
| `workout` | Workout sessions | `activity`, `calories`, `duration`, `distance`, `intensity`, `start_datetime`, `end_datetime` |
| `session` | Mindfulness/breathing sessions | `type`, `mood`, `duration`, `heart_rate`, `hrv` |
| `enhanced_tag` | User-created tags | `tag_type_code`, `comment`, `timestamp` |
| `daily_cardiovascular_age` | Cardiovascular age estimate | `vascular_age` |
| `daily_resilience` | Resilience score & contributors | `level`, `contributors.sleep_recovery`, `.daytime_recovery`, `.stress` |
| `vO2_max` | VO2 max estimate | `vo2_max`, `timestamp` |
| `rest_mode_period` | Rest mode periods | `start_day`, `end_day`, `episodes` |
| `sleep_time` | Recommended sleep times | `recommendation`, `status`, `ideal_bedtime_start`, `ideal_bedtime_end` |
| `ring_configuration` | Ring hardware info | `color`, `design`, `firmware_version`, `hardware_type`, `set_up_at`, `size` |
| `personal_info` | User profile | `age`, `weight`, `height`, `biological_sex`, `email` |
| `tag` | Tags (deprecated, use `enhanced_tag`) | `tag_type_code`, `timestamp` |

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

When delivering a morning summary, fetch `daily_sleep`, `sleep` (detailed periods), `daily_readiness`, `daily_activity`, and `daily_stress` for today. Also fetch yesterday's `daily_activity` as a fallback.

Send only the formatted summary — no preamble, intro message, or extra commentary before or after it.

Format rules:
- Start with "Good morning!" and today's date
- **Sleep**: score with label, total sleep time (convert seconds to Xh Ym), key contributors that are notably high or low. From the detailed `sleep` endpoint, include lowest resting heart rate, average overnight heart rate, and average HRV. Show deep, REM, and light durations in minutes.
- **Readiness**: score with label, body temperature deviation, HRV balance, recovery index. Call out anything that's dragging the score down.
- **Activity**: use today's `daily_activity` if available (score, steps, active calories). If score is null or data is missing, use yesterday's activity instead and note that it's yesterday's data.
- **Stress**: mention if data is available (normal, high, etc.). If no stress data, skip it.
- No app links at the end.
- Keep it concise — 8–10 lines max. Use emoji sparingly. Warm but not cheesy.

Example tone:

```
Good morning! Here's your recap for Monday, Jan 27.

😴 Sleep: 82 (Good) — 7h 12m total
Deep 58m | REM 1h 24m | Light 4h 50m
Lowest HR 52 bpm | Avg HR 58 bpm | HRV 42 ms

💪 Readiness: 78 (Good)
Body temp +0.1°C | HRV balance solid | Recovery index slightly low

🏃 Activity (yesterday): 74 (Good) — 8,241 steps, 312 active cal

Stress: normal range

Solid night overall — deep sleep was a bit short but REM made up for it. Enjoy your day!
```

## Evening Summary Template

When delivering an evening summary, fetch `daily_activity`, `daily_readiness`, `daily_stress`, and `daily_sleep` for today.

Send only the formatted summary — no preamble, intro message, or extra commentary before or after it.

Format rules:
- Start with "Good evening!" and today's date
- Focus on today's **activity**: score, steps, active calories, total calories.
- Include today's **readiness** and **stress**.
- Briefly mention last night's sleep score as a one-line recap.
- End with a short, genuine motivational nudge to wind down and get to bed soon for good recovery. Be warm, not preachy.
- Keep it concise — 6–8 lines max. Use emoji sparingly.

Example tone:

```
Good evening! Here's your day in review for Monday, Jan 27.

🏃 Activity: 81 (Good) — 9,432 steps, 387 active cal, 2,145 total cal
📊 Readiness: 78 (Good) | Stress: normal range
😴 Last night's sleep: 82 (Good)

Nice active day — you moved well. Wind down soon and aim for a solid bedtime to keep the momentum going.
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
