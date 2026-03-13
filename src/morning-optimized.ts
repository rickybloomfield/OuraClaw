import { BASELINE_METRICS } from './config';
import { createHash } from 'node:crypto';
import { evaluateFixedThresholds } from './thresholds';
import { BaselineMetricKey, MorningOptimizedInput, MorningOptimizedResult } from './types';
import { formatDuration } from './date-utils';

const baselineReasonMap: Record<BaselineMetricKey, string> = {
  sleepScore: 'baseline_sleep_score_out_of_range',
  readinessScore: 'baseline_readiness_score_out_of_range',
  temperatureDeviation: 'baseline_temperature_deviation_out_of_range',
  averageHrv: 'baseline_hrv_out_of_range',
  lowestHeartRate: 'baseline_lowest_heart_rate_out_of_range',
  totalSleepDuration: 'baseline_total_sleep_duration_out_of_range',
};

function buildAlertMessage(result: MorningOptimizedResult): string {
  return [
    `Good morning. Today's Oura data is outside your ordinary range for ${result.today.day}.`,
    `Sleep ${result.today.sleepScore}, readiness ${result.today.readinessScore}, temp ${
      result.today.temperatureDeviation == null
        ? 'n/a'
        : result.today.temperatureDeviation.toFixed(1)
    }C.`,
    `Detailed sleep: HRV ${result.today.averageHrv ?? 'n/a'} ms, lowest HR ${
      result.today.lowestHeartRate ?? 'n/a'
    } bpm, total sleep ${formatDuration(result.today.totalSleepDuration ?? null)}.`,
    `Reasons: ${result.reasons.join(', ')}.`,
  ].join(' ');
}

function buildDeliveryKey(result: MorningOptimizedResult): string {
  const payload = JSON.stringify({
    day: result.today.day,
    breachedMetrics: [...(result.breachedMetrics ?? [])].sort(),
    reasons: [...result.reasons].sort(),
    baselineStatus: result.baselineStatus ?? 'none',
  });

  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function evaluateMorningOptimized(input: MorningOptimizedInput): MorningOptimizedResult {
  const missingReasons: string[] = [];
  if (input.today.sleepScore == null) {
    missingReasons.push('missing_sleep_score');
  }
  if (input.today.readinessScore == null) {
    missingReasons.push('missing_readiness_score');
  }
  if (input.today.temperatureDeviation == null) {
    missingReasons.push('missing_temperature_deviation');
  }

  if (missingReasons.length > 0) {
    return {
      dataReady: false,
      ordinary: false,
      shouldSend: false,
      baselineStatus: input.baselineStatus,
      today: input.today,
      baseline: input.baseline,
      reasons: missingReasons,
    };
  }

  const sleepScore = input.today.sleepScore;
  const readinessScore = input.today.readinessScore;
  const temperatureDeviation = input.today.temperatureDeviation;

  const fixedThreshold = evaluateFixedThresholds({
    sleepScore: sleepScore as number,
    readinessScore: readinessScore as number,
    temperatureDeviation: temperatureDeviation as number,
    thresholds: input.thresholds,
  });

  const baselineReasons: string[] = [];
  const breachedMetrics = new Set<BaselineMetricKey>();
  if (input.baseline) {
    for (const metric of BASELINE_METRICS) {
      const snapshot = input.baseline.metrics[metric];
      const value = input.today[metric];
      if (!snapshot || value == null) {
        continue;
      }

      if (value < snapshot.low || value > snapshot.high) {
        const reason = baselineReasonMap[metric];
        baselineReasons.push(reason);
        breachedMetrics.add(metric);
      }
    }
  }

  if (
    fixedThreshold.reasons.includes('sleep_below_threshold') ||
    baselineReasons.includes('baseline_sleep_score_out_of_range')
  ) {
    breachedMetrics.add('sleepScore');
  }
  if (
    fixedThreshold.reasons.includes('readiness_below_threshold') ||
    baselineReasons.includes('baseline_readiness_score_out_of_range')
  ) {
    breachedMetrics.add('readinessScore');
  }
  if (
    fixedThreshold.reasons.includes('temperature_outside_threshold') ||
    baselineReasons.includes('baseline_temperature_deviation_out_of_range')
  ) {
    breachedMetrics.add('temperatureDeviation');
  }

  const baselineTriggered = breachedMetrics.size >= input.baselineConfig.breachMetricCount;
  const shouldSendCandidate = fixedThreshold.reasons.length > 0 || baselineTriggered;
  const reasons = [...fixedThreshold.reasons, ...(baselineTriggered ? baselineReasons : [])];

  const result: MorningOptimizedResult = {
    dataReady: true,
    ordinary: !shouldSendCandidate,
    shouldSend: shouldSendCandidate,
    baselineStatus: input.baselineStatus,
    today: input.today,
    baseline: input.baseline,
    breachedMetrics: [...breachedMetrics],
    reasons,
  };

  if (shouldSendCandidate) {
    result.deliveryKey = buildDeliveryKey(result);
    result.message = buildAlertMessage(result);
  }

  if (
    input.alreadyDeliveredToday &&
    shouldSendCandidate &&
    input.applyDeliverySuppression !== false
  ) {
    return {
      ...result,
      shouldSend: false,
      ordinary: false,
      alreadyDeliveredToday: true,
      deliveryKey: undefined,
      reasons: ['already_delivered_today', ...result.reasons],
    };
  }

  return result;
}
