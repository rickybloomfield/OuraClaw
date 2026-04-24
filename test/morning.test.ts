import { describe, expect, test } from 'vitest';

import { defaultBaselineConfig } from '../src/baseline';
import { evaluateMorning } from '../src/morning';
import { BaselineSnapshot, MorningToday } from '../src/types';
import { defaultThresholds } from '../src/thresholds';

const baseline: BaselineSnapshot = {
  mode: 'calendar-weeks',
  updatedAt: '2026-03-10T00:00:00.000Z',
  sourceStartDay: '2026-02-16',
  sourceEndDay: '2026-03-08',
  weeks: ['2026-W08', '2026-W09', '2026-W10'],
  metrics: {
    sleepScore: { median: 82, low: 78, high: 85, sampleSize: 10 },
    readinessScore: { median: 80, low: 78, high: 83, sampleSize: 10 },
    temperatureDeviation: { median: 0, low: -0.1, high: 0.1, sampleSize: 10 },
    averageHrv: { median: 40, low: 35, high: 45, sampleSize: 10 },
    lowestHeartRate: { median: 49, low: 47, high: 51, sampleSize: 10 },
    totalSleepDuration: { median: 28000, low: 27000, high: 29000, sampleSize: 10 },
  },
};

const readyToday: MorningToday = {
  day: '2026-03-13',
  sleepScore: 82,
  readinessScore: 80,
  temperatureDeviation: 0,
  averageHrv: 40,
  lowestHeartRate: 49,
  totalSleepDuration: 28000,
};

describe('morning', () => {
  test('returns not ready with skip reasons when required fields are missing', () => {
    const result = evaluateMorning({
      today: {
        day: '2026-03-13',
        sleepScore: null,
        readinessScore: 80,
        temperatureDeviation: 0.1,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
    });

    expect(result.dataReady).toBe(false);
    expect(result.shouldAlert).toBe(false);
    expect(result.shouldSend).toBe(false);
    expect(result.skipReasons).toContain('missing_sleep_score');
    expect(result.alertReasons).toEqual([]);
  });

  test('alerts when fixed thresholds fail', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        sleepScore: 70,
        readinessScore: 72,
        temperatureDeviation: 0.3,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline,
    });

    expect(result.dataReady).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.shouldSend).toBe(true);
    expect(result.deliveryKey).toBeDefined();
    expect(result.alertMetrics).toEqual(
      expect.arrayContaining(['sleepScore', 'readinessScore', 'temperatureDeviation'])
    );
    expect(result.alertReasons).toEqual(
      expect.arrayContaining(['sleep_below_threshold', 'readiness_below_threshold'])
    );
    expect(result.message).toContain('attention signals');
  });

  test('does not alert when HRV is better than baseline and resting heart rate is better than baseline', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        averageHrv: 50,
        lowestHeartRate: 45,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline,
    });

    expect(result.shouldAlert).toBe(false);
    expect(result.shouldSend).toBe(false);
    expect(result.alertMetrics).toEqual([]);
    expect(result.alertReasons).toEqual([]);
    expect(result.metricSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'averageHrv',
          direction: 'above_baseline',
          severity: 'better',
          attention: false,
        }),
        expect.objectContaining({
          metric: 'lowestHeartRate',
          direction: 'below_baseline',
          severity: 'better',
          attention: false,
        }),
      ])
    );
  });

  test('alerts when a primary metric is worse than baseline', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        totalSleepDuration: 26000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline,
    });

    expect(result.shouldAlert).toBe(true);
    expect(result.alertMetrics).toEqual(['totalSleepDuration']);
    expect(result.alertReasons).toEqual(['baseline_total_sleep_duration_low']);
  });

  test('does not alert when only one supporting metric is worse than baseline', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        averageHrv: 30,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline,
    });

    expect(result.shouldAlert).toBe(false);
    expect(result.shouldSend).toBe(false);
    expect(result.alertMetrics).toEqual([]);
    expect(result.alertReasons).toEqual([]);
    expect(result.metricSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'averageHrv',
          direction: 'below_baseline',
          severity: 'worse',
          attention: false,
        }),
      ])
    );
  });

  test('alerts when two supporting metrics are worse than baseline', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        averageHrv: 30,
        lowestHeartRate: 55,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline,
    });

    expect(result.shouldAlert).toBe(true);
    expect(result.alertMetrics).toEqual(expect.arrayContaining(['averageHrv', 'lowestHeartRate']));
    expect(result.alertReasons).toEqual(
      expect.arrayContaining(['baseline_hrv_low', 'baseline_lowest_heart_rate_high'])
    );
    expect(result.metricSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'averageHrv',
          attention: true,
        }),
        expect.objectContaining({
          metric: 'lowestHeartRate',
          attention: true,
        }),
      ])
    );
  });

  test('keeps supporting metrics non-actionable when a primary metric alone triggers the alert', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        averageHrv: 30,
        totalSleepDuration: 26000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline,
    });

    expect(result.shouldAlert).toBe(true);
    expect(result.alertMetrics).toEqual(['totalSleepDuration']);
    expect(result.metricSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: 'totalSleepDuration',
          severity: 'worse',
          attention: true,
        }),
        expect.objectContaining({
          metric: 'averageHrv',
          severity: 'worse',
          attention: false,
        }),
      ])
    );
  });

  test('suppresses a sendable result after delivery was already confirmed today', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        sleepScore: 70,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      alreadyDeliveredToday: true,
    });

    expect(result.shouldAlert).toBe(true);
    expect(result.shouldSend).toBe(false);
    expect(result.alreadyDeliveredToday).toBe(true);
    expect(result.deliveryKey).toBeUndefined();
    expect(result.message).toBeUndefined();
    expect(result.skipReasons[0]).toBe('already_delivered_today');
  });

  test('daily-when-ready mode sends a calm morning summary on ready days without alerts', () => {
    const result = evaluateMorning({
      today: readyToday,
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      deliveryMode: 'daily-when-ready',
      baselineStatus: 'ready',
      baseline,
    });

    expect(result.dataReady).toBe(true);
    expect(result.shouldAlert).toBe(false);
    expect(result.shouldSend).toBe(true);
    expect(result.deliveryKey).toBeDefined();
    expect(result.message).toContain('Nothing urgent stands out');
    expect(result.alertMetrics).toEqual([]);
    expect(result.metricSignals).toHaveLength(6);
  });

  test('daily-when-ready mode still returns alert-oriented morning messages when attention is needed', () => {
    const result = evaluateMorning({
      today: {
        ...readyToday,
        sleepScore: 70,
        readinessScore: 72,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline,
      deliveryMode: 'daily-when-ready',
    });

    expect(result.shouldSend).toBe(true);
    expect(result.shouldAlert).toBe(true);
    expect(result.message).toContain('attention signals');
    expect(result.alertMetrics).toEqual(expect.arrayContaining(['sleepScore', 'readinessScore']));
  });
});
