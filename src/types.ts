import { BASELINE_METRICS, OURA_ENDPOINTS } from './config';

export type OuraEndpoint = (typeof OURA_ENDPOINTS)[number];
export type BaselineMetricKey = (typeof BASELINE_METRICS)[number];

export interface OuraTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface OuraApiResponse<T> {
  data: T[];
  next_token?: string;
}

export interface DailySleep {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  contributors: {
    deep_sleep: number | null;
    efficiency: number | null;
    latency: number | null;
    rem_sleep: number | null;
    restfulness: number | null;
    timing: number | null;
    total_sleep: number | null;
  };
}

export interface DailyReadiness {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
  contributors: {
    activity_balance: number | null;
    body_temperature: number | null;
    hrv_balance: number | null;
    previous_day_activity: number | null;
    previous_night: number | null;
    recovery_index: number | null;
    resting_heart_rate: number | null;
    sleep_balance: number | null;
  };
}

export interface DailyActivity {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  active_calories: number;
  total_calories: number;
  steps: number;
}

export interface SleepPeriod {
  id: string;
  day: string;
  bedtime_start: string;
  bedtime_end: string;
  duration: number;
  total_sleep_duration: number;
  awake_time: number;
  light_sleep_duration: number;
  deep_sleep_duration: number;
  rem_sleep_duration: number;
  efficiency: number;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  type: string;
}

export interface DailyStress {
  id: string;
  day: string;
  stress_high: number | null;
  recovery_high: number | null;
  day_summary: string | null;
}

export interface LegacyOuraConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  preferredChannel?: string;
  preferredChannelTarget?: string;
  morningTime?: string;
  eveningTime?: string;
  timezone?: string;
  scheduledMessages?: boolean;
  morningCronJobId?: string;
  eveningCronJobId?: string;
}

export interface OuraAuthState {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

export interface FixedThresholdConfig {
  sleepScoreMin: number;
  readinessScoreMin: number;
  temperatureDeviationMax: number;
}

export interface BaselineConfig {
  lowerPercentile: number;
  supportingMetricAlertCount: number;
}

export type OptimizedWatcherDeliveryMode = 'unusual-only' | 'daily-when-ready';

export interface BaselineMetricSnapshot {
  median: number;
  low: number;
  high: number;
  sampleSize: number;
}

export interface ScheduleConfig {
  enabled: boolean;
  timezone: string;
  deliveryLanguage: string;
  channel?: string;
  target?: string;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  optimizedWatcherEnabled: boolean;
  optimizedWatcherDeliveryMode: OptimizedWatcherDeliveryMode;
  optimizedWatcherStart: string;
  optimizedWatcherEnd: string;
  optimizedWatcherIntervalMinutes: number;
  morningCronJobId?: string;
  eveningCronJobId?: string;
  optimizedWatcherCronJobIds?: string[];
}

export interface BaselineSnapshot {
  mode: 'calendar-weeks' | 'rolling-21-days';
  updatedAt: string;
  sourceStartDay: string;
  sourceEndDay: string;
  weeks?: string[];
  metrics: Partial<Record<BaselineMetricKey, BaselineMetricSnapshot>>;
}

export interface OuraCliState {
  schemaVersion: number;
  auth: OuraAuthState;
  thresholds: FixedThresholdConfig;
  baselineConfig: BaselineConfig;
  schedule: ScheduleConfig;
  baseline?: BaselineSnapshot;
  deliveries?: {
    morningOptimized?: {
      lastDeliveredDay: string;
      lastDeliveredAt: string;
      lastDeliveryKey: string;
    };
  };
}

export interface OuraRecord {
  day: string;
  sleepScore?: number | null;
  readinessScore?: number | null;
  temperatureDeviation?: number | null;
  averageHrv?: number | null;
  lowestHeartRate?: number | null;
  totalSleepDuration?: number | null;
}

export interface OAuthStartInput {
  clientId: string;
  redirectUri?: string;
  scopes?: string;
}

export interface OAuthStartResult {
  authorizeUrl: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface FixedThresholdInput {
  sleepScore: number;
  readinessScore: number;
  temperatureDeviation: number;
  thresholds: FixedThresholdConfig;
}

export interface FixedThresholdResult {
  ordinary: boolean;
  reasons: string[];
}

export type MetricSignalDirection =
  | 'in_range'
  | 'below_baseline'
  | 'above_baseline'
  | 'outside_fixed_threshold'
  | 'missing'
  | 'not_evaluated';

export type MetricSignalSeverity = 'normal' | 'better' | 'worse' | 'missing';

export interface MetricSignal {
  metric: BaselineMetricKey;
  value: number | null;
  baselineMedian?: number;
  baselineLow?: number;
  baselineHigh?: number;
  direction: MetricSignalDirection;
  severity: MetricSignalSeverity;
  attention: boolean;
  reasons: string[];
}

export interface MorningOptimizedToday {
  day: string;
  sleepScore: number | null;
  readinessScore: number | null;
  temperatureDeviation: number | null;
  averageHrv?: number | null;
  lowestHeartRate?: number | null;
  totalSleepDuration?: number | null;
}

export interface MorningOptimizedInput {
  today: MorningOptimizedToday;
  thresholds: FixedThresholdConfig;
  baselineConfig: BaselineConfig;
  deliveryMode?: OptimizedWatcherDeliveryMode;
  baseline?: BaselineSnapshot;
  baselineStatus?: 'ready' | 'missing' | 'stale' | 'refresh_failed';
  alreadyDeliveredToday?: boolean;
  applyDeliverySuppression?: boolean;
}

export interface MorningOptimizedResult {
  dataReady: boolean;
  shouldAlert: boolean;
  shouldSend: boolean;
  deliveryMode: OptimizedWatcherDeliveryMode;
  deliveryType?: 'optimized-alert' | 'morning-summary';
  baselineStatus?: 'ready' | 'missing' | 'stale' | 'refresh_failed';
  message?: string;
  deliveryKey?: string;
  alreadyDeliveredToday?: boolean;
  alertMetrics: BaselineMetricKey[];
  today: MorningOptimizedToday;
  baseline?: BaselineSnapshot;
  morningSummary?: SummaryResult;
  alertReasons: string[];
  skipReasons: string[];
  metricSignals: MetricSignal[];
}

export interface SummaryResult {
  day: string;
  message: string;
  missing: string[];
  payload: Record<string, unknown>;
}

export interface WeekOverviewMetric {
  metric: BaselineMetricKey;
  value: number | null;
  unit: 'score' | 'celsius' | 'milliseconds' | 'bpm' | 'seconds';
  attention: boolean;
  severity: MetricSignalSeverity;
  direction: MetricSignalDirection;
  reasons: string[];
  baselineMedian?: number;
  baselineLow?: number;
  baselineHigh?: number;
}

export interface WeekOverviewDay {
  day: string;
  dataReady: boolean;
  shouldAlert: boolean;
  summaryLine: string;
  alertMetrics: BaselineMetricKey[];
  alertReasons: string[];
  skipReasons: string[];
  metrics: WeekOverviewMetric[];
}

export interface WeekOverviewTopAttentionMetric {
  metric: BaselineMetricKey;
  count: number;
  days: string[];
}

export interface WeekOverviewResult {
  period: {
    mode: 'last-7-days' | 'custom';
    startDay: string;
    endDay: string;
    timezone: string;
  };
  baselineStatus: 'ready' | 'missing' | 'stale' | 'refresh_failed';
  overview: {
    readyDays: number;
    attentionDays: number;
    averageSleepScore: number | null;
    averageReadinessScore: number | null;
    averageTotalSleepDuration: number | null;
    bestSleepDay: string | null;
    lowestReadinessDay: string | null;
    topAttentionMetrics: WeekOverviewTopAttentionMetric[];
  };
  days: WeekOverviewDay[];
}
