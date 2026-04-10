import { createHash } from 'node:crypto';

import { BASELINE_METRICS } from './config';
import { formatDuration } from './date-utils';
import { evaluateFixedThresholds } from './thresholds';
import {
  BaselineMetricKey,
  BaselineMetricSnapshot,
  MetricSignal,
  MorningOptimizedInput,
  MorningOptimizedResult,
  OptimizedWatcherDeliveryMode,
} from './types';

const primaryAlertMetrics = new Set<BaselineMetricKey>([
  'sleepScore',
  'readinessScore',
  'totalSleepDuration',
]);

const supportingAlertMetrics = new Set<BaselineMetricKey>([
  'temperatureDeviation',
  'averageHrv',
  'lowestHeartRate',
]);

const baselineLowReasonMap: Partial<Record<BaselineMetricKey, string>> = {
  sleepScore: 'baseline_sleep_score_low',
  readinessScore: 'baseline_readiness_score_low',
  temperatureDeviation: 'baseline_temperature_deviation_out_of_range',
  averageHrv: 'baseline_hrv_low',
  totalSleepDuration: 'baseline_total_sleep_duration_low',
};

const baselineHighReasonMap: Partial<Record<BaselineMetricKey, string>> = {
  temperatureDeviation: 'baseline_temperature_deviation_out_of_range',
  lowestHeartRate: 'baseline_lowest_heart_rate_high',
};

const fixedReasonMetricMap: Record<string, BaselineMetricKey> = {
  sleep_below_threshold: 'sleepScore',
  readiness_below_threshold: 'readinessScore',
  temperature_outside_threshold: 'temperatureDeviation',
};

function isLowerValueWorse(metric: BaselineMetricKey): boolean {
  return (
    metric === 'sleepScore' ||
    metric === 'readinessScore' ||
    metric === 'averageHrv' ||
    metric === 'totalSleepDuration' ||
    metric === 'temperatureDeviation'
  );
}

function isHigherValueWorse(metric: BaselineMetricKey): boolean {
  return metric === 'lowestHeartRate' || metric === 'temperatureDeviation';
}

function buildAlertMessage(result: MorningOptimizedResult): string {
  return [
    `Good morning. Today's Oura data needs attention for ${result.today.day}.`,
    `Sleep ${result.today.sleepScore}, readiness ${result.today.readinessScore}, temp ${
      result.today.temperatureDeviation == null
        ? 'n/a'
        : result.today.temperatureDeviation.toFixed(1)
    }C.`,
    `Detailed sleep: HRV ${result.today.averageHrv ?? 'n/a'} ms, lowest HR ${
      result.today.lowestHeartRate ?? 'n/a'
    } bpm, total sleep ${formatDuration(result.today.totalSleepDuration ?? null)}.`,
    `Attention: ${result.alertReasons.join(', ')}.`,
  ].join(' ');
}

function buildDeliveryKey(result: MorningOptimizedResult): string {
  const payload = JSON.stringify({
    day: result.today.day,
    deliveryMode: result.deliveryMode,
    deliveryType: result.deliveryType ?? 'none',
    alertMetrics: [...result.alertMetrics].sort(),
    alertReasons: [...result.alertReasons].sort(),
    skipReasons: [...result.skipReasons].sort(),
    baselineStatus: result.baselineStatus ?? 'none',
  });

  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function buildMetricSignal(
  metric: BaselineMetricKey,
  value: number | null | undefined,
  snapshot: BaselineMetricSnapshot | undefined,
  fixedReasons: string[]
): { signal: MetricSignal; baselineAlertReason?: string } {
  const signal: MetricSignal = {
    metric,
    value: value ?? null,
    direction: 'not_evaluated',
    severity: 'normal',
    attention: false,
    reasons: [],
  };

  if (snapshot) {
    signal.baselineMedian = snapshot.median;
    signal.baselineLow = snapshot.low;
    signal.baselineHigh = snapshot.high;
  }

  if (value == null) {
    signal.direction = 'missing';
    signal.severity = 'missing';
    return { signal };
  }

  let baselineAlertReason: string | undefined;
  if (snapshot) {
    if (value < snapshot.low) {
      signal.direction = 'below_baseline';
      signal.severity = isLowerValueWorse(metric) ? 'worse' : 'better';
      baselineAlertReason = signal.severity === 'worse' ? baselineLowReasonMap[metric] : undefined;
      if (baselineAlertReason) {
        signal.reasons.push(baselineAlertReason);
      }
    } else if (value > snapshot.high) {
      signal.direction = 'above_baseline';
      signal.severity = isHigherValueWorse(metric) ? 'worse' : 'better';
      baselineAlertReason = signal.severity === 'worse' ? baselineHighReasonMap[metric] : undefined;
      if (baselineAlertReason) {
        signal.reasons.push(baselineAlertReason);
      }
    } else {
      signal.direction = 'in_range';
      signal.severity = 'normal';
    }
  }

  if (fixedReasons.length > 0) {
    signal.direction = 'outside_fixed_threshold';
    signal.severity = 'worse';
    signal.reasons.push(...fixedReasons);
  }

  signal.attention = signal.severity === 'worse';
  return { signal, baselineAlertReason };
}

function uniqueMetrics(metrics: BaselineMetricKey[]): BaselineMetricKey[] {
  return [...new Set(metrics)];
}

export function evaluateMorningOptimized(input: MorningOptimizedInput): MorningOptimizedResult {
  const deliveryMode: OptimizedWatcherDeliveryMode = input.deliveryMode ?? 'unusual-only';
  const skipReasons: string[] = [];
  if (input.today.sleepScore == null) {
    skipReasons.push('missing_sleep_score');
  }
  if (input.today.readinessScore == null) {
    skipReasons.push('missing_readiness_score');
  }
  if (input.today.temperatureDeviation == null) {
    skipReasons.push('missing_temperature_deviation');
  }

  if (skipReasons.length > 0) {
    return {
      dataReady: false,
      shouldAlert: false,
      shouldSend: false,
      deliveryMode,
      baselineStatus: input.baselineStatus,
      alertMetrics: [],
      today: input.today,
      baseline: input.baseline,
      alertReasons: [],
      skipReasons,
      metricSignals: [],
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

  const fixedReasonsByMetric = new Map<BaselineMetricKey, string[]>();
  for (const reason of fixedThreshold.reasons) {
    const metric = fixedReasonMetricMap[reason];
    if (!metric) {
      continue;
    }
    fixedReasonsByMetric.set(metric, [...(fixedReasonsByMetric.get(metric) ?? []), reason]);
  }

  const metricSignals: MetricSignal[] = [];
  const baselineAlertReasons: string[] = [];
  const baselineAlertMetrics: BaselineMetricKey[] = [];

  for (const metric of BASELINE_METRICS) {
    const { signal, baselineAlertReason } = buildMetricSignal(
      metric,
      input.today[metric],
      input.baseline?.metrics[metric],
      fixedReasonsByMetric.get(metric) ?? []
    );
    metricSignals.push(signal);
    if (baselineAlertReason) {
      baselineAlertReasons.push(baselineAlertReason);
      baselineAlertMetrics.push(metric);
    }
  }

  const fixedAlertMetrics = fixedThreshold.reasons
    .map((reason) => fixedReasonMetricMap[reason])
    .filter((metric): metric is BaselineMetricKey => Boolean(metric));
  const primaryBaselineAlertMetrics = baselineAlertMetrics.filter((metric) =>
    primaryAlertMetrics.has(metric)
  );
  const supportingBaselineAlertMetrics = baselineAlertMetrics.filter((metric) =>
    supportingAlertMetrics.has(metric)
  );
  const supportingBaselineTriggered =
    uniqueMetrics(supportingBaselineAlertMetrics).length >=
    input.baselineConfig.supportingMetricAlertCount;

  const alertMetrics = uniqueMetrics([
    ...fixedAlertMetrics,
    ...primaryBaselineAlertMetrics,
    ...(supportingBaselineTriggered ? supportingBaselineAlertMetrics : []),
  ]);
  const alertReasons = [
    ...fixedThreshold.reasons,
    ...baselineAlertReasons.filter((reason, index) => {
      const metric = baselineAlertMetrics[index];
      return primaryAlertMetrics.has(metric) || supportingBaselineTriggered;
    }),
  ];

  const shouldAlert = alertReasons.length > 0;
  const shouldSendCandidate = shouldAlert || deliveryMode === 'daily-when-ready';

  const result: MorningOptimizedResult = {
    dataReady: true,
    shouldAlert,
    shouldSend: shouldSendCandidate,
    deliveryMode,
    deliveryType: shouldAlert
      ? 'optimized-alert'
      : shouldSendCandidate
        ? 'morning-summary'
        : undefined,
    baselineStatus: input.baselineStatus,
    today: input.today,
    baseline: input.baseline,
    alertMetrics,
    alertReasons,
    skipReasons: [],
    metricSignals,
  };

  if (result.deliveryType === 'optimized-alert') {
    result.deliveryKey = buildDeliveryKey(result);
    result.message = buildAlertMessage(result);
  } else if (result.deliveryType === 'morning-summary') {
    result.deliveryKey = buildDeliveryKey(result);
  }

  if (
    input.alreadyDeliveredToday &&
    shouldSendCandidate &&
    input.applyDeliverySuppression !== false
  ) {
    return {
      ...result,
      shouldSend: false,
      alreadyDeliveredToday: true,
      deliveryKey: undefined,
      skipReasons: ['already_delivered_today', ...result.skipReasons],
    };
  }

  return result;
}
