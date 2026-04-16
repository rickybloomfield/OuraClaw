import { execFile } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promisify } from 'node:util';

import { Command } from 'commander';
import packageJson from '../package.json';

import {
  ensureValidAccessToken,
  getAuthStatus,
  refreshStoredAuth,
  tokenResponseToAuthPatch,
} from './auth';
import { CALLBACK_PORT, DEFAULT_SCHEDULE_CONFIG, OURA_ENDPOINTS } from './config';
import {
  defaultBaselineConfig,
  getAutomaticBaselineWindow,
  getManualBaselineWindow,
  isBaselineStale,
  rebuildAutomaticBaseline,
  rebuildManualBaseline,
  validateBaselineConfig,
} from './baseline';
import { addDays, compareIsoDates, getTodayIsoDate, parseIsoDate } from './date-utils';
import { evaluateMorning } from './morning';
import { exchangeCodeForTokens, buildAuthorizeUrl, captureOAuthCallback } from './oauth';
import { fetchOuraData } from './oura-client';
import { printJson, printText } from './output';
import {
  ChannelTarget,
  createOrReplaceScheduleJobs,
  getConfiguredChannelTargets,
  getLegacyScheduleDefaults,
  getScheduleStatus,
  inspectLegacySchedule,
  isOpenClawAvailable,
  isValidTimeOfDay,
  isValidTimezone,
  listOpenClawCronJobs,
  removeLegacyOuraClawJobs,
  removeManagedScheduleJobs,
} from './schedule';
import { readState, updateState, writeState } from './state-store';
import { buildEveningSummary, selectPreferredSleepRecord } from './summaries';
import { defaultThresholds, validateThresholds } from './thresholds';
import { buildWeekOverview, buildWeekOverviewText } from './week-overview';
import {
  BaselineConfig,
  DailyActivity,
  DailyReadiness,
  DailySleep,
  DailyStress,
  FixedThresholdConfig,
  OuraCliState,
  OuraEndpoint,
  OuraRecord,
  OuraTokenResponse,
  OptimizedWatcherDeliveryMode,
  ScheduleConfig,
  SleepPeriod,
} from './types';

const execFileAsync = promisify(execFile);

interface MaskableReadline extends readline.Interface {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  _writeToOutput?: (text: string) => void;
  stdoutMuted?: boolean;
}

interface OuraCredentials {
  clientId: string;
  clientSecret: string;
}

function openExternalUrl(url: string): Promise<void> {
  if (process.platform === 'darwin') {
    return execFileAsync('open', [url]).then(() => undefined);
  }
  if (process.platform === 'win32') {
    return execFileAsync('cmd', ['/c', 'start', '', url]).then(() => undefined);
  }
  return execFileAsync('xdg-open', [url]).then(() => undefined);
}

export function isLikelyHeadlessSession(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (env.CI) {
    return true;
  }

  if (env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT) {
    return true;
  }

  if (platform === 'linux') {
    return !env.DISPLAY && !env.WAYLAND_DISPLAY;
  }

  return false;
}

export function getClientSecretPrompt(hasExistingSecret: boolean): string {
  return hasExistingSecret
    ? 'Oura Client Secret (press Enter to keep current): '
    : 'Oura Client Secret: ';
}

export function shouldOfferReauthentication(authStatus: ReturnType<typeof getAuthStatus>): boolean {
  return authStatus.hasAccessToken || authStatus.hasRefreshToken;
}

export function getBrowserOpenPrompt(headlessHint: boolean): {
  question: string;
  defaultYes: boolean;
} {
  if (headlessHint) {
    return {
      question: 'This looks like a headless or SSH session. Open the OAuth URL in a browser anyway',
      defaultYes: false,
    };
  }

  return {
    question: 'Open the OAuth URL in your browser now',
    defaultYes: true,
  };
}

export function getScheduleSetupHandoffPrompt(): string {
  return 'Setup complete. Continue with OpenClaw scheduled delivery setup';
}

export function getBaselineSensitivityExplanation(): string {
  return [
    'Baseline sensitivity controls how wide your personal normal range is. 10 = fewer baseline signals, 25 = balanced default, 40 = more sensitive.',
    'For example, lower percentile 25 means the normal band runs from the 25th to 75th percentile of your baseline data.',
  ].join(' ');
}

function getSuggestedTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_SCHEDULE_CONFIG.timezone;
}

function isOptimizedWatcherDeliveryMode(value: string): value is OptimizedWatcherDeliveryMode {
  return value === 'unusual-only' || value === 'daily-when-ready';
}

function createPromptInterface() {
  return readline.createInterface({ input, output });
}

async function ask(
  rl: readline.Interface,
  question: string,
  defaultValue?: string
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = await rl.question(`${question}${suffix}: `);
  return answer.trim() || defaultValue || '';
}

async function askForClientSecret(
  rl: readline.Interface,
  hasExistingSecret: boolean
): Promise<string> {
  const prompt = getClientSecretPrompt(hasExistingSecret);
  const maskableRl = rl as MaskableReadline;
  const originalWrite = maskableRl._writeToOutput;
  const inputTarget = maskableRl.input;
  const canMask =
    Boolean(inputTarget?.isTTY) &&
    process.env.TERM !== 'dumb' &&
    process.env.CI !== 'true' &&
    process.platform !== 'win32';

  if (canMask) {
    maskableRl._writeToOutput = function writeMaskedOutput(textToWrite: string) {
      if (maskableRl.stdoutMuted) {
        maskableRl.output.write('*');
        return;
      }
      return originalWrite?.call(maskableRl, textToWrite);
    };
    maskableRl.stdoutMuted = true;
  }

  try {
    const secret = await rl.question(prompt);
    return secret.trim();
  } finally {
    if (canMask) {
      maskableRl.stdoutMuted = false;
      maskableRl._writeToOutput = originalWrite;
      maskableRl.output.write('\n');
    }
  }
}

async function promptOuraCredentials(
  rl: readline.Interface,
  existing: OuraCliState
): Promise<OuraCredentials> {
  const clientId = await ask(rl, 'Oura Client ID', existing.auth.clientId);
  const enteredSecret = await askForClientSecret(rl, Boolean(existing.auth.clientSecret));
  const clientSecret = enteredSecret || existing.auth.clientSecret || '';
  return { clientId, clientSecret };
}

async function confirm(
  rl: readline.Interface,
  question: string,
  defaultYes = true
): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await rl.question(`${question} ${hint}: `)).trim().toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === 'y' || answer === 'yes';
}

async function runOAuthBrowserFlow(
  rl: readline.Interface,
  credentials: OuraCredentials
): Promise<OuraTokenResponse> {
  const start = buildAuthorizeUrl({ clientId: credentials.clientId });
  const browserPrompt = getBrowserOpenPrompt(isLikelyHeadlessSession());
  const shouldOpenBrowser = await confirm(rl, browserPrompt.question, browserPrompt.defaultYes);

  if (shouldOpenBrowser) {
    printText(`Opening browser for OAuth on http://127.0.0.1:${CALLBACK_PORT}/callback ...`);
    try {
      await openExternalUrl(start.authorizeUrl);
    } catch {
      printText('Browser auto-open failed. Open this URL manually to continue OAuth:');
      printText(start.authorizeUrl);
    }
  } else {
    printText(`Open this URL manually to continue OAuth:\n${start.authorizeUrl}`);
  }

  const code = await captureOAuthCallback(start.state);
  return exchangeCodeForTokens(
    credentials.clientId,
    credentials.clientSecret,
    code,
    start.codeVerifier,
    start.redirectUri
  );
}

async function select(
  rl: readline.Interface,
  question: string,
  choices: string[],
  defaultIndex = 0
): Promise<string> {
  printText(question);
  for (const [index, choice] of choices.entries()) {
    const marker = index === defaultIndex ? ' (default)' : '';
    printText(`  ${index + 1}. ${choice}${marker}`);
  }

  const raw = await rl.question(`Choose [1-${choices.length}] (${defaultIndex + 1}): `);
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > choices.length) {
    return choices[defaultIndex];
  }
  return choices[parsed - 1];
}

function mergeScheduleDefaults(
  current: ScheduleConfig,
  defaults: Partial<ScheduleConfig> | undefined
): ScheduleConfig {
  if (!defaults) {
    return current;
  }

  return {
    ...current,
    timezone:
      current.timezone !== DEFAULT_SCHEDULE_CONFIG.timezone
        ? current.timezone
        : (defaults.timezone ?? current.timezone),
    channel: current.channel ?? defaults.channel,
    target: current.target ?? defaults.target,
    morningEnabled: current.morningEnabled || defaults.morningEnabled || false,
    morningDeliveryMode: current.morningDeliveryMode ?? defaults.morningDeliveryMode,
    morningStart:
      current.morningStart !== DEFAULT_SCHEDULE_CONFIG.morningStart
        ? current.morningStart
        : (defaults.morningStart ?? current.morningStart),
    morningEnd:
      current.morningEnd !== DEFAULT_SCHEDULE_CONFIG.morningEnd
        ? current.morningEnd
        : (defaults.morningEnd ?? current.morningEnd),
    morningIntervalMinutes:
      current.morningIntervalMinutes !== DEFAULT_SCHEDULE_CONFIG.morningIntervalMinutes
        ? current.morningIntervalMinutes
        : (defaults.morningIntervalMinutes ?? current.morningIntervalMinutes),
    eveningEnabled: current.eveningEnabled || defaults.eveningEnabled || false,
    eveningTime:
      current.eveningTime !== DEFAULT_SCHEDULE_CONFIG.eveningTime
        ? current.eveningTime
        : (defaults.eveningTime ?? current.eveningTime),
  };
}

async function promptTimeValue(
  rl: readline.Interface,
  label: string,
  defaultValue: string
): Promise<string> {
  let value: string;
  do {
    value = await ask(rl, label, defaultValue);
    if (isValidTimeOfDay(value)) {
      return value;
    }
    printText('Use HH:MM in 24-hour time, for example 08:00.');
  } while (!isValidTimeOfDay(value));
  return value;
}

async function promptTimezoneValue(rl: readline.Interface, defaultValue: string): Promise<string> {
  let value: string;
  do {
    value = await ask(rl, 'Timezone', defaultValue);
    if (isValidTimezone(value)) {
      return value;
    }
    printText('Use an IANA timezone such as Europe/Bratislava or America/New_York.');
  } while (!isValidTimezone(value));
  return value;
}

async function promptIntervalMinutes(
  rl: readline.Interface,
  defaultValue: number
): Promise<number> {
  let value: number;
  do {
    value = Number(await ask(rl, 'Morning summary interval minutes', String(defaultValue)));
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
    printText('Interval must be a positive whole number of minutes.');
  } while (!Number.isInteger(value) || value <= 0);
  return value;
}

async function promptMorningDeliveryMode(
  rl: readline.Interface,
  defaultValue: OptimizedWatcherDeliveryMode
): Promise<OptimizedWatcherDeliveryMode> {
  const choice = await select(
    rl,
    'Morning summary delivery mode:',
    ['Alert only when attention is needed', "Send every day once today's Oura data is ready"],
    defaultValue === 'daily-when-ready' ? 1 : 0
  );

  return choice === "Send every day once today's Oura data is ready"
    ? 'daily-when-ready'
    : 'unusual-only';
}

async function promptChannelTarget(
  rl: readline.Interface,
  configuredTargets: ChannelTarget[],
  defaults: Pick<ScheduleConfig, 'channel' | 'target'>
): Promise<{ channel: string; target: string }> {
  const existingLabel =
    defaults.channel && defaults.target ? `${defaults.channel} -> ${defaults.target}` : undefined;
  const channels = [...new Set(configuredTargets.map((entry) => entry.channel))];
  const manualChannelChoice = 'Enter a different channel manually';

  if (channels.length > 0) {
    const defaultChannelIndex = defaults.channel ? channels.indexOf(defaults.channel) : -1;
    const channelChoice = await select(
      rl,
      'Choose the delivery channel for scheduled messages:',
      [...channels, manualChannelChoice],
      defaultChannelIndex >= 0 ? defaultChannelIndex : channels.length
    );

    if (channelChoice !== manualChannelChoice) {
      const knownTargets = configuredTargets
        .filter((entry) => entry.channel === channelChoice)
        .map((entry) => entry.target);
      const manualTargetChoice = `Enter a different ${channelChoice} target manually`;
      const defaultTargetIndex =
        defaults.channel === channelChoice && defaults.target
          ? knownTargets.indexOf(defaults.target)
          : -1;

      const targetChoice = await select(
        rl,
        `Choose the delivery target for scheduled messages on ${channelChoice}:`,
        [...knownTargets, manualTargetChoice],
        defaultTargetIndex >= 0 ? defaultTargetIndex : knownTargets.length
      );

      if (targetChoice !== manualTargetChoice) {
        return {
          channel: channelChoice,
          target: targetChoice,
        };
      }

      const target = await ask(
        rl,
        'Delivery target',
        defaults.channel === channelChoice ? defaults.target : undefined
      );
      if (!target) {
        throw new Error(
          `Scheduled delivery requires both channel and target${existingLabel ? `; current default is ${existingLabel}` : ''}.`
        );
      }
      return {
        channel: channelChoice,
        target,
      };
    }
  } else {
    printText('No configured OpenClaw chat targets were discovered, so manual entry time it is.');
  }

  const channel = await ask(rl, 'Delivery channel', defaults.channel);
  const target = await ask(rl, 'Delivery target', defaults.target);
  if (!channel || !target) {
    throw new Error(
      `Scheduled delivery requires both channel and target${existingLabel ? `; current default is ${existingLabel}` : ''}.`
    );
  }
  return { channel, target };
}

interface ScheduleSetupResult {
  configured: boolean;
  openclawAvailable: boolean;
  schedule: ScheduleConfig;
  legacyDetected: boolean;
  removedLegacyJobIds: string[];
}

export interface DeliverySetupResult {
  attempted: boolean;
  configured: boolean;
  provider: 'openclaw';
  available: boolean;
  reason?: 'openclaw_unavailable' | 'skipped_by_user';
  schedule?: ScheduleConfig;
  legacyDetected?: boolean;
  removedLegacyJobIds?: string[];
}

export function buildSetupCompletionMessage(deliverySetup: DeliverySetupResult): string {
  if (!deliverySetup.available) {
    return [
      'Setup complete. OpenClaw is not available, so OpenClaw scheduled delivery was skipped.',
      'The CLI is fully usable without OpenClaw; run commands manually or connect another scheduler.',
    ].join('\n');
  }

  if (!deliverySetup.configured) {
    return 'Setup complete. OpenClaw scheduled delivery was skipped; the CLI is fully usable manually.';
  }

  return 'Setup complete. OpenClaw scheduled delivery is configured.';
}

async function runScheduleSetupFlow(
  rl: readline.Interface,
  emitJson = true
): Promise<ScheduleSetupResult> {
  const existing = readState();
  const openclawAvailable = isOpenClawAvailable();
  if (!openclawAvailable) {
    throw new Error('openclaw is not installed or not available on PATH.');
  }

  const currentSchedule = mergeScheduleDefaults(
    existing.schedule,
    getLegacyScheduleDefaults(inspectLegacySchedule().legacyConfig)
  );
  const configuredTargets = getConfiguredChannelTargets();
  const legacy = inspectLegacySchedule();
  const legacyDetected = Boolean(legacy.legacyConfig) || legacy.legacyJobs.length > 0;
  const timezoneDefault =
    currentSchedule.timezone !== DEFAULT_SCHEDULE_CONFIG.timezone
      ? currentSchedule.timezone
      : (legacy.legacyDefaults?.timezone ?? getSuggestedTimezone());

  if (legacyDetected) {
    printText(
      `Detected legacy OuraClaw plugin scheduling config${legacy.legacyJobs.length > 0 ? ` and ${legacy.legacyJobs.length} old cron job(s)` : ''}.`
    );
    printText(
      'This walkthrough can remove the old plugin jobs and replace them with CLI-managed schedules.'
    );
  }

  const destination = await promptChannelTarget(rl, configuredTargets, currentSchedule);
  const deliveryLanguage = await ask(
    rl,
    'Delivery language',
    currentSchedule.deliveryLanguage || DEFAULT_SCHEDULE_CONFIG.deliveryLanguage
  );
  const timezone = await promptTimezoneValue(rl, timezoneDefault);

  printText(
    'Pick which schedules to manage. The morning summary watcher is the useful one when you want the summary as soon as Oura syncs.'
  );
  const morningEnabled = await confirm(
    rl,
    'Enable morning summary',
    currentSchedule.morningEnabled
  );
  const eveningEnabled = await confirm(rl, 'Enable evening recap', currentSchedule.eveningEnabled);
  const eveningTime = eveningEnabled
    ? await promptTimeValue(rl, 'Evening recap time', currentSchedule.eveningTime)
    : currentSchedule.eveningTime;

  let morningStart = currentSchedule.morningStart;
  let morningEnd = currentSchedule.morningEnd;
  let morningIntervalMinutes = currentSchedule.morningIntervalMinutes;
  let morningDeliveryMode = currentSchedule.morningDeliveryMode;
  if (morningEnabled) {
    printText(
      'Morning summary checks repeatedly inside a morning window until Oura data is ready or the configured mode decides whether to send.'
    );
    printText(
      'Set the same start and end time if you want a single morning check instead of a repeated window.'
    );
    morningDeliveryMode = await promptMorningDeliveryMode(rl, currentSchedule.morningDeliveryMode);
    morningStart = await promptTimeValue(
      rl,
      'Morning summary start time',
      currentSchedule.morningStart
    );
    morningEnd = await promptTimeValue(rl, 'Morning summary end time', currentSchedule.morningEnd);
    morningIntervalMinutes = await promptIntervalMinutes(
      rl,
      currentSchedule.morningIntervalMinutes
    );
  }

  const migrateLegacyJobs = legacyDetected
    ? await confirm(rl, 'Remove old OuraClaw plugin cron jobs during setup', true)
    : false;

  const nextSchedule = createOrReplaceScheduleJobs({
    ...currentSchedule,
    enabled: morningEnabled || eveningEnabled,
    channel: destination.channel,
    target: destination.target,
    deliveryLanguage,
    timezone,
    morningEnabled,
    morningDeliveryMode,
    morningStart,
    morningEnd,
    morningIntervalMinutes,
    eveningEnabled,
    eveningTime,
  });
  updateState({ schedule: nextSchedule });

  const removedLegacyJobIds =
    migrateLegacyJobs && legacyDetected
      ? removeLegacyOuraClawJobs(legacy.legacyConfig, legacy.legacyJobs).removedIds
      : [];

  const result = {
    configured: true,
    openclawAvailable,
    schedule: nextSchedule,
    legacyDetected,
    removedLegacyJobIds,
  };

  if (emitJson) {
    printJson(result);
  }
  return result;
}

export function getNestedValue(target: unknown, keyPath: string): unknown {
  return keyPath.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, target);
}

export function setConfigValue(state: OuraCliState, key: string, value: string): OuraCliState {
  if (key === 'thresholds.sleepScoreMin') {
    state.thresholds.sleepScoreMin = Number(value);
  } else if (key === 'thresholds.readinessScoreMin') {
    state.thresholds.readinessScoreMin = Number(value);
  } else if (key === 'thresholds.temperatureDeviationMax') {
    state.thresholds.temperatureDeviationMax = Number(value);
  } else if (key === 'baselineConfig.lowerPercentile') {
    state.baselineConfig.lowerPercentile = Number(value);
  } else if (key === 'baselineConfig.supportingMetricAlertCount') {
    state.baselineConfig.supportingMetricAlertCount = Number(value);
  } else if (key === 'auth.clientId') {
    state.auth.clientId = value;
  } else if (key === 'auth.clientSecret') {
    state.auth.clientSecret = value;
  } else if (key === 'schedule.deliveryLanguage') {
    state.schedule.deliveryLanguage = value;
  } else if (key === 'schedule.timezone') {
    if (!isValidTimezone(value)) {
      throw new Error(`Invalid timezone: ${value}`);
    }
    state.schedule.timezone = value;
  } else if (key === 'schedule.morningDeliveryMode') {
    if (!isOptimizedWatcherDeliveryMode(value)) {
      throw new Error(`Invalid morning delivery mode: ${value}`);
    }
    state.schedule.morningDeliveryMode = value;
  } else {
    throw new Error(`Unsupported config key: ${key}`);
  }

  state.thresholds = validateThresholds(state.thresholds);
  state.baselineConfig = validateBaselineConfig(state.baselineConfig);
  return state;
}

export function resolveDateRange(startDate?: string, endDate?: string) {
  const today = getTodayIsoDate();
  const start = startDate ?? endDate ?? today;
  const end = endDate ?? startDate ?? today;

  parseIsoDate(start);
  parseIsoDate(end);
  if (compareIsoDates(start, end) > 0) {
    throw new Error('start-date must be earlier than or equal to end-date.');
  }

  return { start, end };
}

function enumerateDays(startDay: string, endDay: string): string[] {
  const days: string[] = [];
  let current = parseIsoDate(startDay);
  const end = parseIsoDate(endDay);
  while (current.getTime() <= end.getTime()) {
    days.push(getTodayIsoDate(current));
    current = addDays(current, 1);
  }
  return days;
}

export function resolveWeekOverviewDateRange(startDate?: string, endDate?: string) {
  const today = getTodayIsoDate();
  let start = startDate;
  let end = endDate;
  const mode: 'custom' | 'last-7-days' = startDate || endDate ? 'custom' : 'last-7-days';

  if (!start && !end) {
    end = getTodayIsoDate(addDays(parseIsoDate(today), -1));
    start = getTodayIsoDate(addDays(parseIsoDate(end), -6));
  } else if (start && !end) {
    parseIsoDate(start);
    end = getTodayIsoDate(addDays(parseIsoDate(start), 6));
  } else if (!start && end) {
    parseIsoDate(end);
    start = getTodayIsoDate(addDays(parseIsoDate(end), -6));
  }

  const range = resolveDateRange(start, end);
  const days = enumerateDays(range.start, range.end);
  if (days.length !== 7) {
    throw new Error('week-overview requires an inclusive 7-day range.');
  }

  return {
    ...range,
    mode,
    days,
  };
}

export async function fetchSingleDay<T>(
  accessToken: string,
  endpoint: OuraEndpoint,
  day: string
): Promise<T | undefined> {
  const response = await fetchOuraData<T>(accessToken, endpoint, day, day);
  return response.data[0];
}

export async function fetchTodaySummaryInputs(accessToken: string, day: string) {
  const yesterday = getTodayIsoDate(addDays(parseIsoDate(day), -1));
  const [dailySleep, dailyReadiness, dailyActivity, dailyStress, sleepResponse] = await Promise.all(
    [
      fetchSingleDay<DailySleep>(accessToken, 'daily_sleep', day),
      fetchSingleDay<DailyReadiness>(accessToken, 'daily_readiness', day),
      fetchSingleDay<DailyActivity>(accessToken, 'daily_activity', day),
      fetchSingleDay<DailyStress>(accessToken, 'daily_stress', day),
      fetchOuraData<SleepPeriod>(accessToken, 'sleep', yesterday, day),
    ]
  );

  return {
    dailySleep,
    dailyReadiness,
    dailyActivity,
    dailyStress,
    sleepRecord: selectPreferredSleepRecord(sleepResponse.data, day),
  };
}

function sleepPeriodToBaselineRecord(record: SleepPeriod): OuraRecord {
  return {
    day: record.day,
    averageHrv: record.average_hrv,
    lowestHeartRate: record.lowest_heart_rate,
    totalSleepDuration: record.total_sleep_duration,
  };
}

function buildDailyMap<T extends { day: string }>(records: T[]): Map<string, T> {
  return new Map(records.map((record) => [record.day, record]));
}

function buildSleepPeriodMap(records: SleepPeriod[]): Map<string, OuraRecord> {
  const grouped = new Map<string, SleepPeriod[]>();
  for (const record of records) {
    const current = grouped.get(record.day) ?? [];
    current.push(record);
    grouped.set(record.day, current);
  }

  return new Map(
    [...grouped.entries()]
      .map(([day, items]) => [day, selectPreferredSleepRecord(items, day)])
      .filter((entry): entry is [string, SleepPeriod] => Boolean(entry[1]))
      .map(([day, record]) => [day, sleepPeriodToBaselineRecord(record)])
  );
}

function hasAnyMorningBaselineValue(record: OuraRecord): boolean {
  return [
    record.sleepScore,
    record.readinessScore,
    record.temperatureDeviation,
    record.averageHrv,
    record.lowestHeartRate,
    record.totalSleepDuration,
  ].some((value) => typeof value === 'number' && Number.isFinite(value));
}

export async function fetchMorningBaselineRecordsForRange(
  accessToken: string,
  startDay: string,
  endDay: string
): Promise<OuraRecord[]> {
  const sleepStartDay = getTodayIsoDate(addDays(parseIsoDate(startDay), -1));
  const [dailySleepResponse, dailyReadinessResponse, sleepResponse] = await Promise.all([
    fetchOuraData<DailySleep>(accessToken, 'daily_sleep', startDay, endDay),
    fetchOuraData<DailyReadiness>(accessToken, 'daily_readiness', startDay, endDay),
    fetchOuraData<SleepPeriod>(accessToken, 'sleep', sleepStartDay, endDay),
  ]);

  const dailySleepByDay = buildDailyMap(dailySleepResponse.data);
  const dailyReadinessByDay = buildDailyMap(dailyReadinessResponse.data);
  const sleepByDay = buildSleepPeriodMap(sleepResponse.data);
  const days = new Set<string>([
    ...dailySleepByDay.keys(),
    ...dailyReadinessByDay.keys(),
    ...sleepByDay.keys(),
  ]);

  return [...days]
    .sort()
    .filter((day) => compareIsoDates(day, startDay) >= 0 && compareIsoDates(day, endDay) <= 0)
    .map((day) => {
      const dailySleep = dailySleepByDay.get(day);
      const dailyReadiness = dailyReadinessByDay.get(day);
      const sleepRecord = sleepByDay.get(day);

      return {
        day,
        sleepScore: dailySleep?.score ?? null,
        readinessScore: dailyReadiness?.score ?? null,
        temperatureDeviation: dailyReadiness?.temperature_deviation ?? null,
        averageHrv: sleepRecord?.averageHrv ?? null,
        lowestHeartRate: sleepRecord?.lowestHeartRate ?? null,
        totalSleepDuration: sleepRecord?.totalSleepDuration ?? null,
      };
    })
    .filter(hasAnyMorningBaselineValue);
}

export async function fetchWeekOverviewRecordsForRange(
  accessToken: string,
  startDay: string,
  endDay: string
): Promise<OuraRecord[]> {
  const shiftedStartDay = getTodayIsoDate(addDays(parseIsoDate(startDay), 1));
  const shiftedEndDay = getTodayIsoDate(addDays(parseIsoDate(endDay), 1));
  const morningRecords = await fetchMorningBaselineRecordsForRange(
    accessToken,
    shiftedStartDay,
    shiftedEndDay
  );

  return morningRecords.map((record) => ({
    ...record,
    day: getTodayIsoDate(addDays(parseIsoDate(record.day), -1)),
  }));
}

function hasMorningDeliveredToday(state: OuraCliState, day: string): boolean {
  return state.deliveries?.morning?.lastDeliveredDay === day;
}

async function buildMorningResult(
  deliveryMode: OptimizedWatcherDeliveryMode = 'unusual-only',
  applyDeliverySuppression = true
): Promise<ReturnType<typeof evaluateMorning>> {
  const day = getTodayIsoDate();
  const accessToken = await ensureValidAccessToken();
  const summaryInputs = await fetchTodaySummaryInputs(accessToken, day);
  let state = readState();
  let baseline = state.baseline;
  let baselineStatus: 'ready' | 'missing' | 'stale' | 'refresh_failed' = baseline
    ? 'ready'
    : 'missing';

  if (!baseline || isBaselineStale(baseline, new Date())) {
    try {
      const window = getAutomaticBaselineWindow(new Date());
      const records = await fetchMorningBaselineRecordsForRange(
        accessToken,
        window.startDay,
        window.endDay
      );
      baseline = rebuildAutomaticBaseline(new Date(), records, state.baselineConfig);
      state = updateState({ baseline });
      baseline = state.baseline;
      baselineStatus = 'ready';
    } catch {
      baselineStatus = 'refresh_failed';
    }
  }

  return evaluateMorning({
    today: {
      day,
      sleepScore: summaryInputs.dailySleep?.score ?? null,
      readinessScore: summaryInputs.dailyReadiness?.score ?? null,
      temperatureDeviation: summaryInputs.dailyReadiness?.temperature_deviation ?? null,
      averageHrv: summaryInputs.sleepRecord?.average_hrv ?? null,
      lowestHeartRate: summaryInputs.sleepRecord?.lowest_heart_rate ?? null,
      totalSleepDuration: summaryInputs.sleepRecord?.total_sleep_duration ?? null,
    },
    thresholds: state.thresholds,
    baselineConfig: state.baselineConfig,
    deliveryMode,
    baseline,
    baselineStatus,
    alreadyDeliveredToday: hasMorningDeliveredToday(state, day),
    applyDeliverySuppression,
  });
}

export async function runSetup(): Promise<void> {
  const existing = readState();
  const rl = createPromptInterface();

  try {
    const credentials = await promptOuraCredentials(rl, existing);
    updateState({ auth: credentials });

    const authStatus = getAuthStatus();
    const shouldReauthenticate = shouldOfferReauthentication(authStatus)
      ? await confirm(rl, 'Existing auth detected. Re-authenticate with Oura', false)
      : true;

    if (shouldReauthenticate) {
      const tokenResponse = await runOAuthBrowserFlow(rl, credentials);
      updateState({
        auth: {
          ...tokenResponseToAuthPatch(tokenResponse),
          ...credentials,
        },
      });
    } else {
      printText('Keeping existing auth tokens and skipping OAuth re-authentication.');
    }

    const defaults = existing.thresholds ?? defaultThresholds();
    const sleepScoreMin = Number(
      (await ask(rl, 'Minimum sleep score', String(defaults.sleepScoreMin))) ||
        defaults.sleepScoreMin
    );
    const readinessScoreMin = Number(
      (await ask(rl, 'Minimum readiness score', String(defaults.readinessScoreMin))) ||
        defaults.readinessScoreMin
    );
    const temperatureDeviationMax = Number(
      (await ask(
        rl,
        'Maximum absolute temperature deviation',
        String(defaults.temperatureDeviationMax)
      )) || defaults.temperatureDeviationMax
    );

    const thresholds: FixedThresholdConfig = validateThresholds({
      sleepScoreMin,
      readinessScoreMin,
      temperatureDeviationMax,
    });

    const baselineDefaults: BaselineConfig = existing.baselineConfig ?? defaultBaselineConfig();
    printText(getBaselineSensitivityExplanation());
    const lowerPercentile = Number(
      (await ask(rl, 'Baseline lower percentile', String(baselineDefaults.lowerPercentile))) ||
        baselineDefaults.lowerPercentile
    );
    const supportingMetricAlertCount = Number(
      (await ask(
        rl,
        'Supporting baseline metrics needed for an alert',
        String(baselineDefaults.supportingMetricAlertCount)
      )) || baselineDefaults.supportingMetricAlertCount
    );

    const baselineConfig = validateBaselineConfig({
      lowerPercentile,
      supportingMetricAlertCount,
    });

    updateState({
      thresholds,
      baselineConfig,
    });
    const freshState = readState();

    const openclawAvailable = isOpenClawAvailable();
    let deliverySetup: DeliverySetupResult = {
      attempted: false,
      configured: false,
      provider: 'openclaw',
      available: openclawAvailable,
      reason: openclawAvailable ? 'skipped_by_user' : 'openclaw_unavailable',
    };
    if (openclawAvailable) {
      const shouldConfigureSchedule = await confirm(rl, getScheduleSetupHandoffPrompt(), true);
      if (shouldConfigureSchedule) {
        const scheduleResult = await runScheduleSetupFlow(rl, false);
        deliverySetup = {
          attempted: true,
          configured: scheduleResult.configured,
          provider: 'openclaw',
          available: scheduleResult.openclawAvailable,
          schedule: scheduleResult.schedule,
          legacyDetected: scheduleResult.legacyDetected,
          removedLegacyJobIds: scheduleResult.removedLegacyJobIds,
        };
      }
    }

    printText(buildSetupCompletionMessage(deliverySetup));
    printJson({
      ok: true,
      configured: true,
      thresholdSource: 'state',
      tokenExpiresAt: freshState.auth.tokenExpiresAt ?? null,
      deliverySetup,
    });
  } finally {
    rl.close();
  }
}

export async function runAuthLogin(): Promise<void> {
  const existing = readState();
  const rl = createPromptInterface();

  try {
    const credentials = await promptOuraCredentials(rl, existing);
    updateState({ auth: credentials });
    const tokenResponse = await runOAuthBrowserFlow(rl, credentials);
    const nextState = updateState({
      auth: {
        ...tokenResponseToAuthPatch(tokenResponse),
        ...credentials,
      },
    });

    printJson({
      ok: true,
      authenticated: true,
      tokenExpiresAt: nextState.auth.tokenExpiresAt ?? null,
    });
  } finally {
    rl.close();
  }
}

export async function runFetch(
  endpoint: OuraEndpoint,
  startDate?: string,
  endDate?: string
): Promise<void> {
  const { start, end } = resolveDateRange(startDate, endDate);
  const accessToken = await ensureValidAccessToken();
  const payload = await fetchOuraData<unknown>(accessToken, endpoint, start, end);
  printJson(payload);
}

export async function rebuildBaseline(mode: 'manual' | 'automatic'): Promise<void> {
  const accessToken = await ensureValidAccessToken();
  const now = new Date();
  const window = mode === 'manual' ? getManualBaselineWindow(now) : getAutomaticBaselineWindow(now);
  const { baselineConfig } = readState();
  const records = await fetchMorningBaselineRecordsForRange(
    accessToken,
    window.startDay,
    window.endDay
  );
  const baseline =
    mode === 'manual'
      ? rebuildManualBaseline(now, records, baselineConfig)
      : rebuildAutomaticBaseline(now, records, baselineConfig);
  updateState({ baseline });
  printJson(baseline);
}

export async function runMorningSummary(
  textMode: boolean,
  deliveryMode: OptimizedWatcherDeliveryMode = 'unusual-only'
): Promise<void> {
  const summary = await buildMorningResult(deliveryMode);

  if (textMode) {
    if (summary.message) {
      printText(summary.message);
    }
    return;
  }

  printJson(summary);
}

export async function runEveningSummary(textMode: boolean): Promise<void> {
  const day = getTodayIsoDate();
  const accessToken = await ensureValidAccessToken();
  const data = await fetchTodaySummaryInputs(accessToken, day);
  const summary = buildEveningSummary({ day, ...data });

  if (textMode) {
    printText(summary.message);
    return;
  }

  printJson({
    day,
    message: summary.message,
    missing: summary.missing,
    ...summary.payload,
  });
}

export async function runMorningSummaryJson(
  deliveryMode: OptimizedWatcherDeliveryMode = 'unusual-only'
): Promise<void> {
  printJson(await buildMorningResult(deliveryMode));
}

export async function runWeekOverview(
  textMode = false,
  startDate?: string,
  endDate?: string
): Promise<void> {
  const range = resolveWeekOverviewDateRange(startDate, endDate);
  const accessToken = await ensureValidAccessToken();
  let state = readState();
  let baseline = state.baseline;
  let baselineStatus: 'ready' | 'missing' | 'stale' | 'refresh_failed' = baseline
    ? 'ready'
    : 'missing';

  if (!baseline || isBaselineStale(baseline, new Date())) {
    try {
      const window = getAutomaticBaselineWindow(new Date());
      const baselineRecords = await fetchMorningBaselineRecordsForRange(
        accessToken,
        window.startDay,
        window.endDay
      );
      baseline = rebuildAutomaticBaseline(new Date(), baselineRecords, state.baselineConfig);
      state = updateState({ baseline });
      baseline = state.baseline;
      baselineStatus = 'ready';
    } catch {
      baselineStatus = 'refresh_failed';
    }
  }

  const [records, activityResponse, stressResponse] = await Promise.all([
    fetchWeekOverviewRecordsForRange(accessToken, range.start, range.end),
    fetchOuraData<DailyActivity>(accessToken, 'daily_activity', range.start, range.end),
    fetchOuraData<DailyStress>(accessToken, 'daily_stress', range.start, range.end),
  ]);
  const result = buildWeekOverview({
    startDay: range.start,
    endDay: range.end,
    timezone: state.schedule.timezone,
    mode: range.mode,
    days: range.days,
    records,
    activityRecords: activityResponse.data,
    stressRecords: stressResponse.data,
    thresholds: state.thresholds,
    baselineConfig: state.baselineConfig,
    baseline,
    baselineStatus,
  });

  if (textMode) {
    printText(buildWeekOverviewText(result));
    return;
  }

  printJson(result);
}

export async function confirmMorningDelivery(
  deliveryKey: string,
  deliveryMode: OptimizedWatcherDeliveryMode = 'unusual-only'
): Promise<void> {
  const day = getTodayIsoDate();
  const state = readState();
  const existing = state.deliveries?.morning;

  if (existing?.lastDeliveredDay === day && existing.lastDeliveryKey === deliveryKey) {
    printJson({
      ok: true,
      confirmed: true,
      alreadyConfirmed: true,
      day,
      deliveryKey,
    });
    return;
  }

  if (existing?.lastDeliveredDay === day && existing.lastDeliveryKey !== deliveryKey) {
    throw new Error('A different morning summary delivery is already confirmed for today.');
  }

  const result = await buildMorningResult(deliveryMode, false);
  if (
    !result.dataReady ||
    !result.shouldSend ||
    !result.deliveryKey ||
    result.deliveryKey !== deliveryKey
  ) {
    throw new Error("Invalid delivery key for today's sendable morning summary result.");
  }

  updateState({
    deliveries: {
      morning: {
        lastDeliveredDay: day,
        lastDeliveredAt: new Date().toISOString(),
        lastDeliveryKey: deliveryKey,
      },
    },
  });

  printJson({
    ok: true,
    confirmed: true,
    day,
    deliveryKey,
  });
}

export async function runScheduleSetup(): Promise<void> {
  const rl = createPromptInterface();
  try {
    await runScheduleSetupFlow(rl);
  } finally {
    rl.close();
  }
}

export function runScheduleStatus(): void {
  const state = readState();
  const status = getScheduleStatus(state.schedule);
  printJson({
    ok: true,
    openclawAvailable: status.openclawAvailable,
    configured: status.configured,
    managedJobs: {
      morning: {
        enabled: status.configured.morningEnabled,
        deliveryMode: status.configured.morningDeliveryMode,
        storedIds: status.configured.morningCronJobIds ?? [],
        existingIds: status.existingManagedJobs
          .filter((job) => (status.configured.morningCronJobIds ?? []).includes(job.id))
          .map((job) => job.id),
      },
      evening: {
        enabled: status.configured.eveningEnabled,
        storedId: status.configured.eveningCronJobId ?? null,
        exists: status.existingManagedJobs.some(
          (job) => job.id === status.configured.eveningCronJobId
        ),
      },
    },
    legacyJobs: status.existingLegacyJobs.map((job) => ({
      id: job.id,
      name: job.name,
    })),
  });
}

export function runScheduleDisable(): void {
  const state = readState();
  const removal = removeManagedScheduleJobs(state.schedule);
  const nextSchedule: ScheduleConfig = {
    ...state.schedule,
    enabled: false,
    morningEnabled: false,
    eveningEnabled: false,
    morningDeliveryMode: state.schedule.morningDeliveryMode,
    morningCronJobIds: [],
    eveningCronJobId: undefined,
  };
  updateState({ schedule: nextSchedule });
  printJson({
    ok: true,
    disabled: true,
    removedJobIds: removal.removedIds,
    schedule: nextSchedule,
  });
}

export function runScheduleMigrateFromOuraClawPlugin(): void {
  const state = readState();
  const jobs = listOpenClawCronJobs();
  const legacy = inspectLegacySchedule(jobs);
  const removal = removeLegacyOuraClawJobs(legacy.legacyConfig, jobs);
  const mergedSchedule = mergeScheduleDefaults(state.schedule, legacy.legacyDefaults);
  updateState({ schedule: mergedSchedule });
  printJson({
    ok: true,
    migrated: true,
    legacyConfigFound: Boolean(legacy.legacyConfig),
    legacyConfigPath: legacy.legacyConfigPath,
    foundLegacyJobIds: removal.foundIds,
    removedLegacyJobIds: removal.removedIds,
    importedDefaults: legacy.legacyDefaults ?? null,
    schedule: mergedSchedule,
  });
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name('ouraclaw-cli')
    .version(packageJson.version, '-V, --version', 'Show CLI version')
    .description('Standalone CLI for Oura automation')
    .showHelpAfterError();

  program
    .command('setup')
    .description('Authenticate with Oura and capture threshold defaults')
    .action(runSetup);

  const schedule = program.command('schedule').description('Manage OpenClaw cron schedules');
  schedule
    .command('setup')
    .description('Configure scheduled summaries and alerts')
    .action(runScheduleSetup);
  schedule
    .command('status')
    .description('Show schedule config and OpenClaw cron status')
    .action(runScheduleStatus);
  schedule
    .command('disable')
    .description('Remove CLI-managed scheduled jobs')
    .action(runScheduleDisable);
  schedule
    .command('migrate-from-ouraclaw-plugin')
    .description('Remove legacy OuraClaw plugin cron jobs and import useful defaults')
    .action(runScheduleMigrateFromOuraClawPlugin);

  const auth = program.command('auth').description('Manage Oura auth state');
  auth
    .command('login')
    .description('Run Oura OAuth without changing thresholds or schedules')
    .action(runAuthLogin);
  auth.command('status').action(() => {
    printJson(getAuthStatus());
  });
  auth.command('refresh').action(async () => {
    const patch = await refreshStoredAuth();
    printJson({
      ok: true,
      tokenExpiresAt: patch.tokenExpiresAt ?? null,
    });
  });

  program
    .command('fetch')
    .description('Fetch a raw Oura endpoint payload')
    .argument('<endpoint>')
    .option('--start-date <startDate>', 'Start date in YYYY-MM-DD format')
    .option('--end-date <endDate>', 'End date in YYYY-MM-DD format')
    .action(async (endpoint: OuraEndpoint, options: { startDate?: string; endDate?: string }) => {
      if (!OURA_ENDPOINTS.includes(endpoint)) {
        throw new Error(`Unsupported endpoint: ${endpoint}`);
      }
      await runFetch(endpoint, options.startDate, options.endDate);
    });

  const baseline = program.command('baseline').description('Manage baseline snapshots');
  baseline.command('rebuild').action(async () => {
    await rebuildBaseline('manual');
  });
  baseline.command('show').action(() => {
    printJson(readState().baseline ?? null);
  });

  const config = program.command('config').description('Read or update CLI configuration');
  config
    .command('get')
    .argument('[key]')
    .action((key?: string) => {
      const state = readState();
      if (!key) {
        printJson(state);
        return;
      }
      printJson(getNestedValue(state, key) ?? null);
    });
  config
    .command('set')
    .argument('<key>')
    .argument('<value>')
    .action((key: string, value: string) => {
      const next = setConfigValue(readState(), key, value);
      writeState(next);
      printJson({
        ok: true,
        key,
        value: getNestedValue(next, key),
      });
    });

  const summary = program.command('summary').description('Build Oura summaries');
  summary
    .command('morning')
    .option(
      '--delivery-mode <deliveryMode>',
      'Delivery mode: unusual-only or daily-when-ready',
      'unusual-only'
    )
    .option('--text', 'Print sendable text for the current sendable morning result')
    .action(async (options: { deliveryMode: string; text?: boolean }) => {
      if (!isOptimizedWatcherDeliveryMode(options.deliveryMode)) {
        throw new Error(`Invalid morning delivery mode: ${options.deliveryMode}`);
      }
      if (options.text) {
        await runMorningSummary(true, options.deliveryMode);
        return;
      }
      await runMorningSummaryJson(options.deliveryMode);
    });
  summary
    .command('morning-confirm')
    .requiredOption('--delivery-key <deliveryKey>', 'Confirm a delivered morning summary')
    .option(
      '--delivery-mode <deliveryMode>',
      'Delivery mode used for the original morning result',
      'unusual-only'
    )
    .action(async (options: { deliveryKey: string; deliveryMode: string }) => {
      if (!isOptimizedWatcherDeliveryMode(options.deliveryMode)) {
        throw new Error(`Invalid morning delivery mode: ${options.deliveryMode}`);
      }
      await confirmMorningDelivery(options.deliveryKey, options.deliveryMode);
    });
  summary
    .command('week-overview')
    .option('--start-date <startDate>', 'Start date in YYYY-MM-DD format')
    .option('--end-date <endDate>', 'End date in YYYY-MM-DD format')
    .option('--text', 'Print compact English recap text')
    .action(async (options: { startDate?: string; endDate?: string; text?: boolean }) => {
      await runWeekOverview(Boolean(options.text), options.startDate, options.endDate);
    });
  summary
    .command('evening')
    .option('--text', 'Print sendable text')
    .action(async (options: { text?: boolean }) => {
      await runEveningSummary(Boolean(options.text));
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
