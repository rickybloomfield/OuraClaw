import { describe, expect, test } from 'vitest';

import { defaultBaselineConfig } from '../src/baseline';
import { defaultThresholds } from '../src/thresholds';
import { BaselineSnapshot } from '../src/types';
import { buildWeekOverview } from '../src/week-overview';

const baseline: BaselineSnapshot = {
  mode: 'calendar-weeks',
  updatedAt: '2026-04-10T00:00:00.000Z',
  sourceStartDay: '2026-03-16',
  sourceEndDay: '2026-04-05',
  weeks: ['2026-W12', '2026-W13', '2026-W14'],
  metrics: {
    sleepScore: { median: 85, low: 80, high: 90, sampleSize: 21 },
    readinessScore: { median: 84, low: 80, high: 88, sampleSize: 21 },
    temperatureDeviation: { median: 0, low: -0.1, high: 0.1, sampleSize: 21 },
    averageHrv: { median: 40, low: 35, high: 45, sampleSize: 21 },
    lowestHeartRate: { median: 50, low: 48, high: 52, sampleSize: 21 },
    totalSleepDuration: { median: 27000, low: 25000, high: 29000, sampleSize: 21 },
  },
};

describe('week-overview', () => {
  test('builds seven daily rows with metric attention details and overview totals', () => {
    const result = buildWeekOverview({
      startDay: '2026-04-04',
      endDay: '2026-04-10',
      timezone: 'Europe/Vienna',
      mode: 'last-7-days',
      days: [
        '2026-04-04',
        '2026-04-05',
        '2026-04-06',
        '2026-04-07',
        '2026-04-08',
        '2026-04-09',
        '2026-04-10',
      ],
      records: [
        {
          day: '2026-04-04',
          sleepScore: 86,
          readinessScore: 85,
          temperatureDeviation: 0,
          averageHrv: 41,
          lowestHeartRate: 49,
          totalSleepDuration: 28000,
        },
        {
          day: '2026-04-05',
          sleepScore: 81,
          readinessScore: 82,
          temperatureDeviation: 0,
          averageHrv: 30,
          lowestHeartRate: 55,
          totalSleepDuration: 27000,
        },
        {
          day: '2026-04-06',
          sleepScore: 82,
          readinessScore: 83,
          temperatureDeviation: 0,
          averageHrv: 50,
          lowestHeartRate: 46,
          totalSleepDuration: 26000,
        },
        {
          day: '2026-04-07',
          sleepScore: 82,
          readinessScore: 83,
          temperatureDeviation: 0,
          averageHrv: 30,
          lowestHeartRate: 49,
          totalSleepDuration: 26000,
        },
      ],
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baseline,
      baselineStatus: 'ready',
    });

    expect(result.period).toEqual({
      mode: 'last-7-days',
      startDay: '2026-04-04',
      endDay: '2026-04-10',
      timezone: 'Europe/Vienna',
    });
    expect(result.days).toHaveLength(7);
    expect(result.overview.readyDays).toBe(4);
    expect(result.overview.attentionDays).toBe(2);
    expect(result.overview.bestSleepDay).toBe('2026-04-04');
    expect(result.days[1]).toEqual(
      expect.objectContaining({
        day: '2026-04-05',
        shouldAlert: true,
        alertMetrics: expect.arrayContaining(['averageHrv', 'lowestHeartRate']),
      })
    );
    expect(result.days[1].metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'averageHrv',
          attention: true,
          reasons: ['baseline_hrv_low'],
        }),
      ])
    );
    expect(result.days[2].shouldAlert).toBe(false);
    expect(result.days[2].metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'averageHrv',
          severity: 'better',
          attention: false,
        }),
      ])
    );
    expect(result.days[3]).toEqual(
      expect.objectContaining({
        day: '2026-04-07',
        shouldAlert: false,
        summaryLine: expect.stringContaining('Attention needed.'),
      })
    );
    expect(result.days[6]).toEqual(
      expect.objectContaining({
        day: '2026-04-10',
        dataReady: false,
        skipReasons: expect.arrayContaining(['missing_sleep_score']),
      })
    );
  });
});
