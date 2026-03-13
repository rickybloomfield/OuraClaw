import {
  DailyActivity,
  DailyReadiness,
  DailySleep,
  DailyStress,
  SleepPeriod,
  SummaryResult,
} from './types';
import { formatDisplayDate, formatDuration } from './date-utils';

function scoreLabel(score: number | null | undefined): string {
  if (score == null) {
    return 'Pending';
  }
  if (score >= 85) {
    return 'Excellent';
  }
  if (score >= 70) {
    return 'Good';
  }
  if (score >= 60) {
    return 'Fair';
  }
  return 'Needs attention';
}

function formatTemperature(value: number | null | undefined): string {
  if (value == null) {
    return 'n/a';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}C`;
}

export function selectPreferredSleepRecord(
  records: SleepPeriod[],
  day: string
): SleepPeriod | undefined {
  const matches = records.filter((record) => record.day === day);
  return matches.find((record) => record.type === 'long_sleep') ?? matches[0];
}

export function buildMorningSummary(params: {
  day: string;
  dailySleep?: DailySleep;
  dailyReadiness?: DailyReadiness;
  dailyActivity?: DailyActivity;
  dailyStress?: DailyStress;
  sleepRecord?: SleepPeriod;
}): SummaryResult {
  const missing: string[] = [];
  if (!params.dailySleep?.score) {
    missing.push('sleep_score');
  }
  if (!params.dailyReadiness?.score) {
    missing.push('readiness_score');
  }
  if (!params.dailyActivity?.score) {
    missing.push('activity_score');
  }

  const lines = [
    `Good morning! Here's your recap for ${formatDisplayDate(params.day)}.`,
    `Sleep: ${params.dailySleep?.score ?? 'n/a'} (${scoreLabel(params.dailySleep?.score)}) — ${formatDuration(
      params.sleepRecord?.total_sleep_duration ?? null
    )} total`,
    `Readiness: ${params.dailyReadiness?.score ?? 'n/a'} (${scoreLabel(
      params.dailyReadiness?.score
    )}) — temp ${formatTemperature(params.dailyReadiness?.temperature_deviation)}`,
    `Activity: ${params.dailyActivity?.score ?? 'n/a'} (${scoreLabel(params.dailyActivity?.score)}) — ${
      params.dailyActivity?.steps ?? 0
    } steps, ${params.dailyActivity?.active_calories ?? 0} active cal`,
    `Stress: ${params.dailyStress?.day_summary ?? 'not available yet'}`,
    `Overnight: lowest HR ${params.sleepRecord?.lowest_heart_rate ?? 'n/a'} bpm | avg HR ${
      params.sleepRecord?.average_heart_rate ?? 'n/a'
    } bpm | HRV ${params.sleepRecord?.average_hrv ?? 'n/a'} ms`,
  ];

  return {
    day: params.day,
    message: lines.join('\n'),
    missing,
    payload: {
      dailySleep: params.dailySleep ?? null,
      dailyReadiness: params.dailyReadiness ?? null,
      dailyActivity: params.dailyActivity ?? null,
      dailyStress: params.dailyStress ?? null,
      sleepRecord: params.sleepRecord ?? null,
    },
  };
}

export function buildEveningSummary(params: {
  day: string;
  dailySleep?: DailySleep;
  dailyReadiness?: DailyReadiness;
  dailyActivity?: DailyActivity;
  dailyStress?: DailyStress;
}): SummaryResult {
  const missing: string[] = [];
  if (!params.dailyActivity?.score) {
    missing.push('activity_score');
  }

  const lines = [
    `Good evening! Here's your day in review for ${formatDisplayDate(params.day)}.`,
    `Activity: ${params.dailyActivity?.score ?? 'n/a'} (${scoreLabel(params.dailyActivity?.score)}) — ${
      params.dailyActivity?.steps ?? 0
    } steps, ${params.dailyActivity?.active_calories ?? 0} active cal, ${
      params.dailyActivity?.total_calories ?? 0
    } total cal`,
    `Readiness: ${params.dailyReadiness?.score ?? 'n/a'} (${scoreLabel(
      params.dailyReadiness?.score
    )}) | Stress: ${params.dailyStress?.day_summary ?? 'not available yet'}`,
    `Last night's sleep: ${params.dailySleep?.score ?? 'n/a'} (${scoreLabel(params.dailySleep?.score)})`,
    'Wind down soon and give tomorrow a cleaner runway.',
  ];

  return {
    day: params.day,
    message: lines.join('\n'),
    missing,
    payload: {
      dailySleep: params.dailySleep ?? null,
      dailyReadiness: params.dailyReadiness ?? null,
      dailyActivity: params.dailyActivity ?? null,
      dailyStress: params.dailyStress ?? null,
    },
  };
}
