import { describe, expect, test } from 'vitest';

import { defaultBaselineConfig } from '../src/baseline';
import { evaluateMorningOptimized } from '../src/morning-optimized';
import { defaultThresholds } from '../src/thresholds';

describe('morning-optimized', () => {
  test('returns not ready when required fields are missing', () => {
    const result = evaluateMorningOptimized({
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
    expect(result.shouldSend).toBe(false);
    expect(result.reasons).toContain('missing_sleep_score');
  });

  test('sends when fixed thresholds fail', () => {
    const result = evaluateMorningOptimized({
      today: {
        day: '2026-03-13',
        sleepScore: 70,
        readinessScore: 72,
        temperatureDeviation: 0.3,
        averageHrv: 42,
        lowestHeartRate: 48,
        totalSleepDuration: 28000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
    });

    expect(result.dataReady).toBe(true);
    expect(result.shouldSend).toBe(true);
    expect(result.deliveryKey).toBeDefined();
    expect(result.breachedMetrics).toEqual(
      expect.arrayContaining(['sleepScore', 'readinessScore', 'temperatureDeviation'])
    );
    expect(result.reasons.slice(0, 2)).toEqual([
      'sleep_below_threshold',
      'readiness_below_threshold',
    ]);
    expect(result.message).toContain('outside your ordinary range');
  });

  test('sends when a baseline-only metric is out of range', () => {
    const result = evaluateMorningOptimized({
      today: {
        day: '2026-03-13',
        sleepScore: 80,
        readinessScore: 82,
        temperatureDeviation: 0,
        averageHrv: 20,
        lowestHeartRate: 60,
        totalSleepDuration: 25000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      baseline: {
        mode: 'calendar-weeks',
        updatedAt: '2026-03-10T00:00:00.000Z',
        sourceStartDay: '2026-02-16',
        sourceEndDay: '2026-03-08',
        weeks: ['2026-W08', '2026-W09', '2026-W10'],
        metrics: {
          sleepScore: { median: 78, low: 76, high: 84, sampleSize: 10 },
          readinessScore: { median: 82, low: 80, high: 85, sampleSize: 10 },
          temperatureDeviation: { median: 0, low: -0.1, high: 0.1, sampleSize: 10 },
          averageHrv: { median: 40, low: 35, high: 45, sampleSize: 10 },
          lowestHeartRate: { median: 49, low: 47, high: 51, sampleSize: 10 },
          totalSleepDuration: { median: 28000, low: 27000, high: 29000, sampleSize: 10 },
        },
      },
    });

    expect(result.shouldSend).toBe(true);
    expect(result.reasons).toContain('baseline_hrv_out_of_range');
    expect(result.breachedMetrics).toContain('averageHrv');
  });

  test('does not double count a metric breached by threshold and baseline', () => {
    const result = evaluateMorningOptimized({
      today: {
        day: '2026-03-13',
        sleepScore: 70,
        readinessScore: 80,
        temperatureDeviation: 0.2,
        averageHrv: 20,
        lowestHeartRate: 60,
        totalSleepDuration: 28000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: {
        lowerPercentile: 25,
        breachMetricCount: 2,
      },
      baselineStatus: 'ready',
      baseline: {
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
        },
      },
    });

    expect(result.reasons[0]).toBe('sleep_below_threshold');
    expect(result.reasons).toContain('baseline_sleep_score_out_of_range');
    expect(result.breachedMetrics).toEqual(
      expect.arrayContaining(['sleepScore', 'temperatureDeviation'])
    );
    expect(result.breachedMetrics?.filter((metric) => metric === 'sleepScore')).toHaveLength(1);
  });

  test('suppresses a sendable result after delivery was already confirmed today', () => {
    const result = evaluateMorningOptimized({
      today: {
        day: '2026-03-13',
        sleepScore: 70,
        readinessScore: 80,
        temperatureDeviation: 0,
        averageHrv: 42,
        lowestHeartRate: 48,
        totalSleepDuration: 28000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      alreadyDeliveredToday: true,
    });

    expect(result.shouldSend).toBe(false);
    expect(result.ordinary).toBe(false);
    expect(result.alreadyDeliveredToday).toBe(true);
    expect(result.deliveryKey).toBeUndefined();
    expect(result.reasons[0]).toBe('already_delivered_today');
  });

  test('daily-when-ready mode sends a morning summary on ordinary ready days', () => {
    const result = evaluateMorningOptimized({
      today: {
        day: '2026-03-13',
        sleepScore: 82,
        readinessScore: 80,
        temperatureDeviation: 0,
        averageHrv: 40,
        lowestHeartRate: 49,
        totalSleepDuration: 28000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      deliveryMode: 'daily-when-ready',
    });

    expect(result.dataReady).toBe(true);
    expect(result.ordinary).toBe(true);
    expect(result.shouldSend).toBe(true);
    expect(result.deliveryType).toBe('morning-summary');
    expect(result.deliveryKey).toBeDefined();
    expect(result.breachedMetrics).toEqual([]);
  });

  test('daily-when-ready mode still reports breached metrics on unusual days', () => {
    const result = evaluateMorningOptimized({
      today: {
        day: '2026-03-13',
        sleepScore: 70,
        readinessScore: 72,
        temperatureDeviation: 0.3,
        averageHrv: 42,
        lowestHeartRate: 48,
        totalSleepDuration: 28000,
      },
      thresholds: defaultThresholds(),
      baselineConfig: defaultBaselineConfig(),
      baselineStatus: 'ready',
      deliveryMode: 'daily-when-ready',
    });

    expect(result.shouldSend).toBe(true);
    expect(result.deliveryType).toBe('optimized-alert');
    expect(result.breachedMetrics).toEqual(
      expect.arrayContaining(['sleepScore', 'readinessScore', 'temperatureDeviation'])
    );
    expect(result.reasons).toEqual(
      expect.arrayContaining(['sleep_below_threshold', 'readiness_below_threshold'])
    );
  });
});
