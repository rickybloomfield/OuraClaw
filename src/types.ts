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
  breachMetricCount: number;
}

export interface BaselineMetricSnapshot {
  median: number;
  low: number;
  high: number;
  sampleSize: number;
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
  baseline?: BaselineSnapshot;
  baselineStatus?: 'ready' | 'missing' | 'stale' | 'refresh_failed';
  alreadyDeliveredToday?: boolean;
  applyDeliverySuppression?: boolean;
}

export interface MorningOptimizedResult {
  dataReady: boolean;
  ordinary: boolean;
  shouldSend: boolean;
  baselineStatus?: 'ready' | 'missing' | 'stale' | 'refresh_failed';
  message?: string;
  deliveryKey?: string;
  alreadyDeliveredToday?: boolean;
  breachedMetrics?: BaselineMetricKey[];
  today: MorningOptimizedToday;
  baseline?: BaselineSnapshot;
  reasons: string[];
}

export interface SummaryResult {
  day: string;
  message: string;
  missing: string[];
  payload: Record<string, unknown>;
}
