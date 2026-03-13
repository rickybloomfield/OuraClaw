import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_NAME = 'ouraclaw-cli';
export const SCHEMA_VERSION = 1;

export const CALLBACK_HOST = '127.0.0.1';
export const CALLBACK_PORT = 9876;
export const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
export const AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
export const TOKEN_URL = 'https://api.ouraring.com/oauth/token';
export const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';
export const DEFAULT_OAUTH_TIMEOUT_MS = 120_000;
export const OAUTH_SCOPES =
  'email personal daily heartrate workout session spo2 tag stress heart_health ring_configuration';

export const DEFAULT_THRESHOLDS = {
  sleepScoreMin: 75,
  readinessScoreMin: 75,
  temperatureDeviationMax: 0.1,
} as const;

export const DEFAULT_BASELINE_CONFIG = {
  lowerPercentile: 25,
  breachMetricCount: 1,
} as const;

export const BASELINE_METRICS = [
  'sleepScore',
  'readinessScore',
  'temperatureDeviation',
  'averageHrv',
  'lowestHeartRate',
  'totalSleepDuration',
] as const;

export const OURA_ENDPOINTS = [
  'daily_activity',
  'daily_cardiovascular_age',
  'daily_readiness',
  'daily_resilience',
  'daily_sleep',
  'daily_spo2',
  'daily_stress',
  'enhanced_tag',
  'heartrate',
  'personal_info',
  'rest_mode_period',
  'ring_configuration',
  'session',
  'sleep',
  'sleep_time',
  'tag',
  'vO2_max',
  'workout',
] as const;

export function getStateDir(): string {
  return process.env.OURACLAW_CLI_HOME ?? join(homedir(), '.ouraclaw-cli');
}

export function getStateFilePath(): string {
  return join(getStateDir(), 'ouraclaw-cli.json');
}

export function getLegacyConfigFilePath(): string {
  return (
    process.env.OURACLAW_CLI_LEGACY_CONFIG_FILE ??
    join(homedir(), '.openclaw', 'plugins', 'ouraclaw', 'config.json')
  );
}
