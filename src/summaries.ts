import {
  DailyActivity,
  DailyReadiness,
  DailySleep,
  DailyStress,
  SleepPeriod,
  SummaryResult,
} from './types';
import { formatDisplayDate } from './date-utils';

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

export function selectPreferredSleepRecord(
  records: SleepPeriod[],
  day: string
): SleepPeriod | undefined {
  const matches = records.filter((record) => record.day === day);
  return matches.find((record) => record.type === 'long_sleep') ?? matches[0];
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
