import { BASELINE_METRICS } from './config';
import { formatDuration } from './date-utils';
import { evaluateMorningOptimized } from './morning-optimized';
import {
  BaselineConfig,
  BaselineMetricKey,
  BaselineSnapshot,
  FixedThresholdConfig,
  MetricSignal,
  MorningOptimizedToday,
  OuraRecord,
  WeekOverviewDay,
  WeekOverviewMetric,
  WeekOverviewResult,
  WeekOverviewTopAttentionMetric,
} from './types';

const metricUnits: Record<BaselineMetricKey, WeekOverviewMetric['unit']> = {
  sleepScore: 'score',
  readinessScore: 'score',
  temperatureDeviation: 'celsius',
  averageHrv: 'milliseconds',
  lowestHeartRate: 'bpm',
  totalSleepDuration: 'seconds',
};

function average(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number');
  if (numeric.length === 0) {
    return null;
  }
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function findMaxDay(days: MorningOptimizedToday[], metric: BaselineMetricKey): string | null {
  const ranked = days
    .map((day) => ({ day: day.day, value: day[metric] }))
    .filter((entry): entry is { day: string; value: number } => typeof entry.value === 'number')
    .sort((left, right) => right.value - left.value);
  return ranked[0]?.day ?? null;
}

function findMinDay(days: MorningOptimizedToday[], metric: BaselineMetricKey): string | null {
  const ranked = days
    .map((day) => ({ day: day.day, value: day[metric] }))
    .filter((entry): entry is { day: string; value: number } => typeof entry.value === 'number')
    .sort((left, right) => left.value - right.value);
  return ranked[0]?.day ?? null;
}

function buildFallbackSignals(today: MorningOptimizedToday): MetricSignal[] {
  return BASELINE_METRICS.map((metric) => ({
    metric,
    value: today[metric] ?? null,
    direction: today[metric] == null ? 'missing' : 'not_evaluated',
    severity: today[metric] == null ? 'missing' : 'normal',
    attention: false,
    reasons: [],
  }));
}

function toWeekMetric(signal: MetricSignal): WeekOverviewMetric {
  return {
    metric: signal.metric,
    value: signal.value,
    unit: metricUnits[signal.metric],
    attention: signal.attention,
    severity: signal.severity,
    direction: signal.direction,
    reasons: signal.reasons,
    ...(signal.baselineMedian === undefined ? {} : { baselineMedian: signal.baselineMedian }),
    ...(signal.baselineLow === undefined ? {} : { baselineLow: signal.baselineLow }),
    ...(signal.baselineHigh === undefined ? {} : { baselineHigh: signal.baselineHigh }),
  };
}

function buildSummaryLine(day: MorningOptimizedToday, shouldAlert: boolean): string {
  const status = shouldAlert ? 'Attention needed.' : 'No attention flags.';
  return [
    `Sleep ${day.sleepScore ?? 'n/a'}`,
    `readiness ${day.readinessScore ?? 'n/a'}`,
    `total ${formatDuration(day.totalSleepDuration ?? null)}`,
    status,
  ].join(', ');
}

function buildTopAttentionMetrics(days: WeekOverviewDay[]): WeekOverviewTopAttentionMetric[] {
  return BASELINE_METRICS.map((metric) => {
    const attentionDays = days
      .filter((day) => day.metrics.some((entry) => entry.metric === metric && entry.attention))
      .map((day) => day.day);
    return {
      metric,
      count: attentionDays.length,
      days: attentionDays,
    };
  })
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.metric.localeCompare(right.metric));
}

export function buildWeekOverview(input: {
  startDay: string;
  endDay: string;
  timezone: string;
  mode: WeekOverviewResult['period']['mode'];
  days: string[];
  records: OuraRecord[];
  thresholds: FixedThresholdConfig;
  baselineConfig: BaselineConfig;
  baseline?: BaselineSnapshot;
  baselineStatus: WeekOverviewResult['baselineStatus'];
}): WeekOverviewResult {
  const recordsByDay = new Map(input.records.map((record) => [record.day, record]));
  const todayValues: MorningOptimizedToday[] = input.days.map((day) => {
    const record = recordsByDay.get(day);
    return {
      day,
      sleepScore: record?.sleepScore ?? null,
      readinessScore: record?.readinessScore ?? null,
      temperatureDeviation: record?.temperatureDeviation ?? null,
      averageHrv: record?.averageHrv ?? null,
      lowestHeartRate: record?.lowestHeartRate ?? null,
      totalSleepDuration: record?.totalSleepDuration ?? null,
    };
  });

  const days: WeekOverviewDay[] = todayValues.map((today) => {
    const result = evaluateMorningOptimized({
      today,
      thresholds: input.thresholds,
      baselineConfig: input.baselineConfig,
      baseline: input.baseline,
      baselineStatus: input.baselineStatus,
      applyDeliverySuppression: false,
    });
    const signals =
      result.metricSignals.length > 0 ? result.metricSignals : buildFallbackSignals(today);
    const hasAttentionMetric = signals.some((signal) => signal.attention);

    return {
      day: today.day,
      dataReady: result.dataReady,
      shouldAlert: result.shouldAlert,
      summaryLine: buildSummaryLine(today, hasAttentionMetric),
      alertMetrics: result.alertMetrics,
      alertReasons: result.alertReasons,
      skipReasons: result.skipReasons,
      metrics: signals.map(toWeekMetric),
    };
  });

  return {
    period: {
      mode: input.mode,
      startDay: input.startDay,
      endDay: input.endDay,
      timezone: input.timezone,
    },
    baselineStatus: input.baselineStatus,
    overview: {
      readyDays: days.filter((day) => day.dataReady).length,
      attentionDays: days.filter((day) => day.metrics.some((metric) => metric.attention)).length,
      averageSleepScore: average(todayValues.map((day) => day.sleepScore)),
      averageReadinessScore: average(todayValues.map((day) => day.readinessScore)),
      averageTotalSleepDuration: average(todayValues.map((day) => day.totalSleepDuration)),
      bestSleepDay: findMaxDay(todayValues, 'sleepScore'),
      lowestReadinessDay: findMinDay(todayValues, 'readinessScore'),
      topAttentionMetrics: buildTopAttentionMetrics(days),
    },
    days,
  };
}
