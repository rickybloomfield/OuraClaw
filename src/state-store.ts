import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_BASELINE_CONFIG,
  DEFAULT_SCHEDULE_CONFIG,
  DEFAULT_THRESHOLDS,
  SCHEMA_VERSION,
  getLegacyConfigFilePath,
  getStateDir,
  getStateFilePath,
} from './config';
import {
  BaselineConfig,
  LegacyOuraConfig,
  OuraCliState,
  OptimizedWatcherDeliveryMode,
  ScheduleConfig,
} from './types';

export function defaultState(): OuraCliState {
  return {
    schemaVersion: SCHEMA_VERSION,
    auth: {},
    thresholds: {
      sleepScoreMin: DEFAULT_THRESHOLDS.sleepScoreMin,
      readinessScoreMin: DEFAULT_THRESHOLDS.readinessScoreMin,
      temperatureDeviationMax: DEFAULT_THRESHOLDS.temperatureDeviationMax,
    },
    baselineConfig: {
      lowerPercentile: DEFAULT_BASELINE_CONFIG.lowerPercentile,
      supportingMetricAlertCount: DEFAULT_BASELINE_CONFIG.supportingMetricAlertCount,
    },
    schedule: {
      enabled: DEFAULT_SCHEDULE_CONFIG.enabled,
      timezone: DEFAULT_SCHEDULE_CONFIG.timezone,
      deliveryLanguage: DEFAULT_SCHEDULE_CONFIG.deliveryLanguage,
      morningEnabled: DEFAULT_SCHEDULE_CONFIG.morningEnabled,
      morningDeliveryMode: DEFAULT_SCHEDULE_CONFIG.morningDeliveryMode,
      morningStart: DEFAULT_SCHEDULE_CONFIG.morningStart,
      morningEnd: DEFAULT_SCHEDULE_CONFIG.morningEnd,
      morningIntervalMinutes: DEFAULT_SCHEDULE_CONFIG.morningIntervalMinutes,
      eveningEnabled: DEFAULT_SCHEDULE_CONFIG.eveningEnabled,
      eveningTime: DEFAULT_SCHEDULE_CONFIG.eveningTime,
      weeklyOverviewEnabled: DEFAULT_SCHEDULE_CONFIG.weeklyOverviewEnabled,
      weeklyOverviewDay: DEFAULT_SCHEDULE_CONFIG.weeklyOverviewDay,
      weeklyOverviewTime: DEFAULT_SCHEDULE_CONFIG.weeklyOverviewTime,
    },
    deliveries: {},
  };
}

function normalizeBaselineConfig(input: unknown, base: BaselineConfig): BaselineConfig {
  const candidate = input as Partial<BaselineConfig> | null | undefined;
  return {
    lowerPercentile:
      typeof candidate?.lowerPercentile === 'number'
        ? candidate.lowerPercentile
        : base.lowerPercentile,
    supportingMetricAlertCount:
      typeof candidate?.supportingMetricAlertCount === 'number'
        ? candidate.supportingMetricAlertCount
        : base.supportingMetricAlertCount,
  };
}

export function ensurePrivateStateDir(): void {
  const dir = getStateDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Best effort on platforms that ignore chmod.
  }
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function normalizeState(input: Partial<OuraCliState> | null): OuraCliState {
  const base = defaultState();
  if (!input) {
    return base;
  }

  const legacyDeliveries = (input.deliveries ?? {}) as Partial<OuraCliState['deliveries']> & {
    morningOptimized?: {
      lastDeliveredDay: string;
      lastDeliveredAt: string;
      lastDeliveryKey: string;
    };
  };
  const scheduleInput = (input.schedule ?? {}) as Partial<ScheduleConfig> & {
    morningTime?: string;
    optimizedWatcherEnabled?: boolean;
    optimizedWatcherDeliveryMode?: OptimizedWatcherDeliveryMode;
    optimizedWatcherStart?: string;
    optimizedWatcherEnd?: string;
    optimizedWatcherIntervalMinutes?: number;
    optimizedWatcherCronJobIds?: unknown[];
  };

  const morningDelivery = legacyDeliveries.morning ?? legacyDeliveries.morningOptimized;
  const normalizedMorningDelivery =
    morningDelivery?.lastDeliveredDay &&
    morningDelivery.lastDeliveredAt &&
    morningDelivery.lastDeliveryKey
      ? {
          lastDeliveredDay: morningDelivery.lastDeliveredDay,
          lastDeliveredAt: morningDelivery.lastDeliveredAt,
          lastDeliveryKey: morningDelivery.lastDeliveryKey,
        }
      : undefined;
  const normalizedMorningCronJobIds = Array.isArray(scheduleInput.morningCronJobIds)
    ? scheduleInput.morningCronJobIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      )
    : undefined;
  const normalizedLegacyOptimizedWatcherCronJobIds = Array.isArray(
    scheduleInput.optimizedWatcherCronJobIds
  )
    ? scheduleInput.optimizedWatcherCronJobIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      )
    : undefined;
  const normalizedSchedule = {
    ...base.schedule,
    ...scheduleInput,
  };
  normalizedSchedule.morningDeliveryMode =
    scheduleInput.morningDeliveryMode ??
    scheduleInput.optimizedWatcherDeliveryMode ??
    base.schedule.morningDeliveryMode;
  normalizedSchedule.morningStart =
    scheduleInput.morningStart ??
    scheduleInput.optimizedWatcherStart ??
    scheduleInput.morningTime ??
    base.schedule.morningStart;
  normalizedSchedule.morningEnd =
    scheduleInput.morningEnd ??
    scheduleInput.optimizedWatcherEnd ??
    scheduleInput.morningTime ??
    base.schedule.morningEnd;
  normalizedSchedule.morningIntervalMinutes =
    scheduleInput.morningIntervalMinutes ??
    scheduleInput.optimizedWatcherIntervalMinutes ??
    base.schedule.morningIntervalMinutes;
  normalizedSchedule.morningEnabled =
    scheduleInput.morningEnabled ??
    scheduleInput.optimizedWatcherEnabled ??
    base.schedule.morningEnabled;
  if (normalizedMorningCronJobIds) {
    normalizedSchedule.morningCronJobIds = normalizedMorningCronJobIds;
  } else if (normalizedLegacyOptimizedWatcherCronJobIds) {
    normalizedSchedule.morningCronJobIds = normalizedLegacyOptimizedWatcherCronJobIds;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    auth: { ...base.auth, ...(input.auth ?? {}) },
    thresholds: { ...base.thresholds, ...(input.thresholds ?? {}) },
    baselineConfig: normalizeBaselineConfig(input.baselineConfig, base.baselineConfig),
    schedule: normalizedSchedule,
    baseline: input.baseline ?? base.baseline,
    deliveries: {
      ...base.deliveries,
      ...(input.deliveries ?? {}),
      ...(normalizedMorningDelivery ? { morning: normalizedMorningDelivery } : {}),
    },
  };
}

function migrateLegacyConfig(): OuraCliState | null {
  const legacyPath = getLegacyConfigFilePath();
  const legacy = safeReadJson<LegacyOuraConfig>(legacyPath);
  if (!legacy) {
    return null;
  }

  const migrated = defaultState();
  migrated.auth = {
    clientId: legacy.clientId,
    clientSecret: legacy.clientSecret,
    accessToken: legacy.accessToken,
    refreshToken: legacy.refreshToken,
    tokenExpiresAt: legacy.tokenExpiresAt,
  };

  return migrated;
}

export function writeState(state: OuraCliState): void {
  ensurePrivateStateDir();
  const filePath = getStateFilePath();
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort on platforms that ignore chmod.
  }
}

export function readState(): OuraCliState {
  const filePath = getStateFilePath();
  const current = safeReadJson<OuraCliState>(filePath);
  if (current) {
    return normalizeState(current);
  }

  const migrated = migrateLegacyConfig();
  if (migrated) {
    writeState(migrated);
    return migrated;
  }

  return defaultState();
}

export function updateState(patch: Partial<OuraCliState>): OuraCliState {
  const current = readState();
  const next: OuraCliState = {
    ...current,
    ...patch,
    auth: patch.auth ? { ...current.auth, ...patch.auth } : current.auth,
    thresholds: patch.thresholds
      ? { ...current.thresholds, ...patch.thresholds }
      : current.thresholds,
    baselineConfig: patch.baselineConfig
      ? { ...current.baselineConfig, ...patch.baselineConfig }
      : current.baselineConfig,
    schedule: patch.schedule
      ? {
          ...current.schedule,
          ...patch.schedule,
          morningCronJobIds:
            patch.schedule.morningCronJobIds === undefined
              ? current.schedule.morningCronJobIds
              : patch.schedule.morningCronJobIds.filter(
                  (id): id is string => typeof id === 'string' && id.length > 0
                ),
        }
      : current.schedule,
    baseline: patch.baseline === undefined ? current.baseline : patch.baseline,
    deliveries: patch.deliveries
      ? {
          ...current.deliveries,
          ...patch.deliveries,
          morning: patch.deliveries.morning
            ? {
                ...current.deliveries?.morning,
                ...patch.deliveries.morning,
              }
            : current.deliveries?.morning,
        }
      : current.deliveries,
  };

  writeState(next);
  return next;
}

export function stateExists(): boolean {
  return fs.existsSync(path.resolve(getStateFilePath()));
}
