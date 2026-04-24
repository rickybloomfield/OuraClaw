import { describe, expect, test } from 'vitest';

import { buildEveningSummary, selectPreferredSleepRecord } from '../src/summaries';

describe('summaries', () => {
  test('prefers long sleep record for the target day', () => {
    const record = selectPreferredSleepRecord(
      [
        {
          id: '1',
          day: '2026-03-13',
          bedtime_start: '',
          bedtime_end: '',
          duration: 1,
          total_sleep_duration: 1,
          awake_time: 1,
          light_sleep_duration: 1,
          deep_sleep_duration: 1,
          rem_sleep_duration: 1,
          efficiency: 1,
          average_heart_rate: 60,
          lowest_heart_rate: 50,
          average_hrv: 40,
          type: 'nap',
        },
        {
          id: '2',
          day: '2026-03-13',
          bedtime_start: '',
          bedtime_end: '',
          duration: 2,
          total_sleep_duration: 2,
          awake_time: 2,
          light_sleep_duration: 2,
          deep_sleep_duration: 2,
          rem_sleep_duration: 2,
          efficiency: 2,
          average_heart_rate: 58,
          lowest_heart_rate: 48,
          average_hrv: 42,
          type: 'long_sleep',
        },
      ],
      '2026-03-13'
    );

    expect(record?.id).toBe('2');
  });

  test('builds an evening summary message', () => {
    const result = buildEveningSummary({
      day: '2026-03-13',
      dailySleep: {
        id: 'sleep',
        day: '2026-03-13',
        score: 81,
        timestamp: '',
        contributors: {} as never,
      },
      dailyReadiness: {
        id: 'ready',
        day: '2026-03-13',
        score: 74,
        timestamp: '',
        temperature_deviation: 0,
        temperature_trend_deviation: 0,
        contributors: {} as never,
      },
      dailyActivity: {
        id: 'activity',
        day: '2026-03-13',
        score: 79,
        timestamp: '',
        active_calories: 350,
        total_calories: 2200,
        steps: 9200,
      },
      dailyStress: {
        id: 'stress',
        day: '2026-03-13',
        stress_high: 10,
        recovery_high: 5,
        day_summary: 'steady',
      },
    });

    expect(result.message).toContain('Good evening!');
    expect(result.message).toContain("Last night's sleep: 81 (Good)");
  });
});
