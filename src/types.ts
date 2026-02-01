// Oura API v2 response types

export interface OuraConfig {
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
  equivalent_walking_distance: number;
  high_activity_time: number;
  medium_activity_time: number;
  low_activity_time: number;
  sedentary_time: number;
  resting_time: number;
  met: {
    interval: number;
    items: number[];
    timestamp: string;
  };
  contributors: {
    meet_daily_targets: number | null;
    move_every_hour: number | null;
    recovery_time: number | null;
    stay_active: number | null;
    training_frequency: number | null;
    training_volume: number | null;
  };
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
  restless_periods: number;
  efficiency: number;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  type: string;
  readiness_score_delta: number | null;
}

export interface DailyStress {
  id: string;
  day: string;
  stress_high: number | null;
  recovery_high: number | null;
  day_summary: string | null;
}

export type OuraEndpoint =
  | "daily_sleep"
  | "daily_readiness"
  | "daily_activity"
  | "sleep"
  | "daily_stress";

export const OURA_ENDPOINTS: OuraEndpoint[] = [
  "daily_sleep",
  "daily_readiness",
  "daily_activity",
  "sleep",
  "daily_stress",
];
