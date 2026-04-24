import { describe, expect, test } from 'vitest';

import { defaultThresholds, evaluateFixedThresholds, validateThresholds } from '../src/thresholds';

describe('thresholds', () => {
  test('returns default thresholds', () => {
    expect(defaultThresholds()).toEqual({
      sleepScoreMin: 75,
      readinessScoreMin: 75,
      temperatureDeviationMax: 0.1,
    });
  });

  test('validates thresholds', () => {
    expect(
      validateThresholds({
        sleepScoreMin: 77,
        readinessScoreMin: 74,
        temperatureDeviationMax: 0.2,
      })
    ).toEqual({
      sleepScoreMin: 77,
      readinessScoreMin: 74,
      temperatureDeviationMax: 0.2,
    });
  });

  test('evaluates fixed threshold failures', () => {
    expect(
      evaluateFixedThresholds({
        sleepScore: 70,
        readinessScore: 60,
        temperatureDeviation: 0.3,
        thresholds: defaultThresholds(),
      })
    ).toEqual({
      ordinary: false,
      reasons: [
        'sleep_below_threshold',
        'readiness_below_threshold',
        'temperature_outside_threshold',
      ],
    });
  });

  test('rejects invalid threshold input', () => {
    expect(() =>
      validateThresholds({
        sleepScoreMin: 101,
        readinessScoreMin: 70,
        temperatureDeviationMax: 0.1,
      })
    ).toThrow('sleepScoreMin');

    expect(() =>
      validateThresholds({
        sleepScoreMin: 70,
        readinessScoreMin: 70,
        temperatureDeviationMax: -1,
      })
    ).toThrow('temperatureDeviationMax');
  });
});
