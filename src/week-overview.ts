import { BASELINE_METRICS } from './config';
import { formatDuration, parseIsoDate } from './date-utils';
import { evaluateMorning } from './morning';
import {
  BaselineConfig,
  BaselineMetricKey,
  BaselineSnapshot,
  DailyActivity,
  DailyStress,
  FixedThresholdConfig,
  MetricSignal,
  MorningToday,
  OuraRecord,
  WeekOverviewActivity,
  WeekOverviewDay,
  WeekOverviewMetric,
  WeekOverviewResult,
  WeekOverviewStress,
  WeekOverviewStressSummaryCount,
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

function buildFallbackSignals(today: MorningToday): MetricSignal[] {
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

function normalizeActivity(record?: DailyActivity): WeekOverviewActivity {
  return {
    score: record?.score ?? null,
    steps: record?.steps ?? null,
    activeCalories: record?.active_calories ?? null,
    totalCalories: record?.total_calories ?? null,
  };
}

function normalizeStress(record?: DailyStress): WeekOverviewStress {
  return {
    daySummary: record?.day_summary ?? null,
    stressHigh: record?.stress_high ?? null,
    recoveryHigh: record?.recovery_high ?? null,
  };
}

function buildTopStressSummaries(days: WeekOverviewDay[]): WeekOverviewStressSummaryCount[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    const summary = day.stress.daySummary?.trim();
    if (!summary) {
      continue;
    }
    counts.set(summary, (counts.get(summary) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([summary, count]) => ({ summary, count }))
    .sort((left, right) => right.count - left.count || left.summary.localeCompare(right.summary));
}

function formatShortRangeDate(day: string): string {
  return parseIsoDate(day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatSteps(steps: number): string {
  if (steps >= 10_000) {
    const rounded = Math.round((steps / 1000) * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded.toFixed(0)}k` : `${rounded.toFixed(1)}k`;
  }
  if (steps >= 1000) {
    return `${(Math.round((steps / 1000) * 10) / 10).toFixed(1)}k`;
  }
  return String(steps);
}

function formatTopAttentionMetric(metric: BaselineMetricKey): string {
  switch (metric) {
    case 'sleepScore':
      return 'sleep';
    case 'readinessScore':
      return 'readiness';
    case 'temperatureDeviation':
      return 'temperature';
    case 'averageHrv':
      return 'HRV';
    case 'lowestHeartRate':
      return 'lowest heart rate';
    case 'totalSleepDuration':
      return 'total sleep';
  }
}

export function buildWeekOverviewText(result: WeekOverviewResult): string {
  const lines = [
    `Your Oura overview for ${formatShortRangeDate(result.period.startDay)} - ${formatShortRangeDate(result.period.endDay)}.`,
    '',
    ...result.days.map((day) => {
      const parts: string[] = [];
      if (day.summaryLine.length > 0) {
        parts.push(day.summaryLine);
      }
      if (day.activity.steps != null) {
        parts.push(`Steps ${formatSteps(day.activity.steps)}`);
      }
      if (day.stress.daySummary) {
        parts.push(`Stress ${day.stress.daySummary}`);
      }

      return `${day.weekday.slice(0, 3)}: ${parts.length > 0 ? parts.join(' | ') : 'data not ready'}`;
    }),
  ];

  const topMetric = result.overview.topAttentionMetrics[0];
  if (topMetric) {
    lines.push('');
    lines.push(
      `Main pattern: ${formatTopAttentionMetric(topMetric.metric)} was the most repeated attention signal this week.`
    );
  }

  return lines.join('\n');
}

export function buildWeekOverview(input: {
  startDay: string;
  endDay: string;
  timezone: string;
  mode: WeekOverviewResult['period']['mode'];
  days: string[];
  records: OuraRecord[];
  activityRecords: DailyActivity[];
  stressRecords: DailyStress[];
  thresholds: FixedThresholdConfig;
  baselineConfig: BaselineConfig;
  baseline?: BaselineSnapshot;
  baselineStatus: WeekOverviewResult['baselineStatus'];
}): WeekOverviewResult {
  const recordsByDay = new Map(input.records.map((record) => [record.day, record]));
  const activityByDay = new Map(input.activityRecords.map((record) => [record.day, record]));
  const stressByDay = new Map(input.stressRecords.map((record) => [record.day, record]));
  const todayValues: MorningToday[] = input.days.map((day) => {
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
    const result = evaluateMorning({
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
    const activity = normalizeActivity(activityByDay.get(today.day));
    const stress = normalizeStress(stressByDay.get(today.day));

    return {
      day: today.day,
      weekday: getWeekday(today.day),
      dataReady: result.dataReady,
      shouldAlert: result.shouldAlert,
      summaryLine: buildSummaryLine(metrics),
      attentionMetrics,
      missingMetrics,
      metrics,
      activity,
      stress,
    };
  });

  const stepDays = days.filter((day) => day.activity.steps != null);
  const totalSteps = stepDays.reduce((sum, day) => sum + (day.activity.steps ?? 0), 0);

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
      totalSteps,
      averageSteps: stepDays.length > 0 ? Math.round(totalSteps / stepDays.length) : null,
      topStressSummaries: buildTopStressSummaries(days),
    },
    days,
  };
}
