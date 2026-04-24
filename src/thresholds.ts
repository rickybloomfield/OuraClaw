import { DEFAULT_THRESHOLDS } from './config';
import { FixedThresholdConfig, FixedThresholdInput, FixedThresholdResult } from './types';

export function defaultThresholds(): FixedThresholdConfig {
  return {
    sleepScoreMin: DEFAULT_THRESHOLDS.sleepScoreMin,
    readinessScoreMin: DEFAULT_THRESHOLDS.readinessScoreMin,
    temperatureDeviationMax: DEFAULT_THRESHOLDS.temperatureDeviationMax,
  };
}

export function validateThresholds(input: unknown): FixedThresholdConfig {
  const candidate = input as Partial<FixedThresholdConfig>;
  const thresholds = {
    sleepScoreMin: Number(candidate.sleepScoreMin),
    readinessScoreMin: Number(candidate.readinessScoreMin),
    temperatureDeviationMax: Number(candidate.temperatureDeviationMax),
  };

  if (
    !Number.isFinite(thresholds.sleepScoreMin) ||
    !Number.isFinite(thresholds.readinessScoreMin) ||
    !Number.isFinite(thresholds.temperatureDeviationMax)
  ) {
    throw new Error('Thresholds must be numeric.');
  }

  if (thresholds.sleepScoreMin < 0 || thresholds.sleepScoreMin > 100) {
    throw new Error('sleepScoreMin must be between 0 and 100.');
  }

  if (thresholds.readinessScoreMin < 0 || thresholds.readinessScoreMin > 100) {
    throw new Error('readinessScoreMin must be between 0 and 100.');
  }

  if (thresholds.temperatureDeviationMax < 0) {
    throw new Error('temperatureDeviationMax must be zero or positive.');
  }

  return thresholds;
}

export function evaluateFixedThresholds(input: FixedThresholdInput): FixedThresholdResult {
  const reasons: string[] = [];

  if (input.sleepScore < input.thresholds.sleepScoreMin) {
    reasons.push('sleep_below_threshold');
  }

  if (input.readinessScore < input.thresholds.readinessScoreMin) {
    reasons.push('readiness_below_threshold');
  }

  if (Math.abs(input.temperatureDeviation) > input.thresholds.temperatureDeviationMax) {
    reasons.push('temperature_outside_threshold');
  }

  return {
    ordinary: reasons.length === 0,
    reasons,
  };
}
