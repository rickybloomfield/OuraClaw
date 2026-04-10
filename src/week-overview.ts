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

const metricOrder: BaselineMetricKey[] = [
  'sleepScore',
  'readinessScore',
  'totalSleepDuration',
  'temperatureDeviation',
  'lowestHeartRate',
  'averageHrv',
];

const metricUnits: Record<BaselineMetricKey, WeekOverviewMetric['unit']> = {
  sleepScore: 'score',
  readinessScore: 'score',
  temperatureDeviation: 'celsius',
  averageHrv: 'milliseconds',
  lowestHeartRate: 'bpm',
  totalSleepDuration: 'seconds',
};

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

function formatTemperature(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}C`;
}

function formatMetricValue(metric: BaselineMetricKey, value: number): string {
  switch (metric) {
    case 'sleepScore':
    case 'readinessScore':
      return String(value);
    case 'temperatureDeviation':
      return formatTemperature(value);
    case 'averageHrv':
      return `${value} ms`;
    case 'lowestHeartRate':
      return `${value} bpm`;
    case 'totalSleepDuration':
      return formatDuration(value);
  }
}

function toWeekMetric(signal: MetricSignal): WeekOverviewMetric | null {
  if (signal.value == null) {
    return null;
  }
  return {
    key: signal.metric,
    value: signal.value,
    unit: metricUnits[signal.metric],
    displayValue: formatMetricValue(signal.metric, signal.value),
    attention: signal.attention,
  };
}

function getWeekday(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
}

function buildSummaryLine(metrics: WeekOverviewMetric[]): string {
  const labels: Record<BaselineMetricKey, string> = {
    sleepScore: 'Sleep',
    readinessScore: 'Readiness',
    temperatureDeviation: 'Temp',
    averageHrv: 'HRV',
    lowestHeartRate: 'Lowest HR',
    totalSleepDuration: 'Total',
  };

  return metricOrder
    .flatMap((metric) => {
      const item = metrics.find((entry) => entry.key === metric);
      if (!item) {
        return [];
      }
      const prefix = item.attention ? '⚠️ ' : '';
      return `${prefix}${labels[metric]} ${item.displayValue}`;
    })
    .join(' | ');
}

function buildTopAttentionMetrics(days: WeekOverviewDay[]): WeekOverviewTopAttentionMetric[] {
  return BASELINE_METRICS.map((metric) => {
    const count = days.filter((day) => day.attentionMetrics.includes(metric)).length;
    return {
      metric,
      count,
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
    const metrics = metricOrder
      .map((metric) => signals.find((signal) => signal.metric === metric))
      .flatMap((signal) => {
        const metric = signal ? toWeekMetric(signal) : null;
        return metric ? [metric] : [];
      });
    const attentionMetrics = metricOrder.filter((metric) =>
      signals.some((signal) => signal.metric === metric && signal.attention)
    );
    const missingMetrics = metricOrder.filter((metric) =>
      signals.some((signal) => signal.metric === metric && signal.value == null)
    );

    return {
      day: today.day,
      weekday: getWeekday(today.day),
      dataReady: result.dataReady,
      shouldAlert: result.shouldAlert,
      summaryLine: buildSummaryLine(metrics),
      attentionMetrics,
      missingMetrics,
      metrics,
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
    metricOrder,
    overview: {
      readyDays: days.filter((day) => day.dataReady).length,
      attentionDays: days.filter((day) => day.metrics.some((metric) => metric.attention)).length,
      topAttentionMetrics: buildTopAttentionMetrics(days),
    },
    days,
  };
}
