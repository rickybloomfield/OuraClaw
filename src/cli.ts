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
import { CALLBACK_PORT, OURA_ENDPOINTS } from './config';
import {
  getAutomaticBaselineWindow,
  getManualBaselineWindow,
  isBaselineStale,
  rebuildAutomaticBaseline,
  rebuildManualBaseline,
} from './baseline';
import { addDays, compareIsoDates, getTodayIsoDate, parseIsoDate } from './date-utils';
import { evaluateMorningOptimized } from './morning-optimized';
import { exchangeCodeForTokens, buildAuthorizeUrl, captureOAuthCallback } from './oauth';
import { fetchOuraData } from './oura-client';
import { printJson, printText } from './output';
import { readState, updateState, writeState } from './state-store';
import { buildEveningSummary, buildMorningSummary, selectPreferredSleepRecord } from './summaries';
import { defaultThresholds, validateThresholds } from './thresholds';
import {
  DailyActivity,
  DailyReadiness,
  DailySleep,
  DailyStress,
  FixedThresholdConfig,
  OuraCliState,
  OuraEndpoint,
  OuraRecord,
  SleepPeriod,
} from './types';

const execFileAsync = promisify(execFile);

function openExternalUrl(url: string): Promise<void> {
  if (process.platform === 'darwin') {
    return execFileAsync('open', [url]).then(() => undefined);
  }
  if (process.platform === 'win32') {
    return execFileAsync('cmd', ['/c', 'start', '', url]).then(() => undefined);
  }
  return execFileAsync('xdg-open', [url]).then(() => undefined);
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
  } else if (key === 'auth.clientId') {
    state.auth.clientId = value;
  } else if (key === 'auth.clientSecret') {
    state.auth.clientSecret = value;
  } else {
    throw new Error(`Unsupported config key: ${key}`);
  }

  state.thresholds = validateThresholds(state.thresholds);
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

export async function fetchSleepRecordsForRange(
  accessToken: string,
  startDay: string,
  endDay: string
): Promise<OuraRecord[]> {
  const response = await fetchOuraData<SleepPeriod>(accessToken, 'sleep', startDay, endDay);
  const grouped = new Map<string, SleepPeriod[]>();
  for (const record of response.data) {
    const records = grouped.get(record.day) ?? [];
    records.push(record);
    grouped.set(record.day, records);
  }

  return [...grouped.entries()]
    .map(([day, records]) => selectPreferredSleepRecord(records, day))
    .filter((record): record is SleepPeriod => Boolean(record))
    .map(sleepPeriodToBaselineRecord);
}

export async function runSetup(): Promise<void> {
  const existing = readState();
  const rl = readline.createInterface({ input, output });

  try {
    const clientId =
      (await rl.question(
        `Oura Client ID${existing.auth.clientId ? ` (${existing.auth.clientId})` : ''}: `
      )) ||
      existing.auth.clientId ||
      '';
    const clientSecret =
      (await rl.question(
        `Oura Client Secret${existing.auth.clientSecret ? ' (press Enter to keep current)' : ''}: `
      )) ||
      existing.auth.clientSecret ||
      '';

    const defaults = existing.thresholds ?? defaultThresholds();
    const sleepScoreMin = Number(
      (await rl.question(`Minimum sleep score (${defaults.sleepScoreMin}): `)) ||
        defaults.sleepScoreMin
    );
    const readinessScoreMin = Number(
      (await rl.question(`Minimum readiness score (${defaults.readinessScoreMin}): `)) ||
        defaults.readinessScoreMin
    );
    const temperatureDeviationMax = Number(
      (await rl.question(
        `Maximum absolute temperature deviation (${defaults.temperatureDeviationMax}): `
      )) || defaults.temperatureDeviationMax
    );

    const thresholds: FixedThresholdConfig = validateThresholds({
      sleepScoreMin,
      readinessScoreMin,
      temperatureDeviationMax,
    });

    updateState({
      auth: { clientId, clientSecret },
      thresholds,
    });

    const start = buildAuthorizeUrl({ clientId });
    printText(`Opening browser for OAuth on http://127.0.0.1:${CALLBACK_PORT}/callback ...`);
    await openExternalUrl(start.authorizeUrl);
    const code = await captureOAuthCallback(start.state);
    const tokenResponse = await exchangeCodeForTokens(
      clientId,
      clientSecret,
      code,
      start.codeVerifier,
      start.redirectUri
    );

    const freshState = readState();
    freshState.auth = {
      ...freshState.auth,
      ...tokenResponseToAuthPatch(tokenResponse),
      clientId,
      clientSecret,
    };
    freshState.thresholds = thresholds;
    writeState(freshState);
    printJson({
      ok: true,
      configured: true,
      thresholdSource: 'state',
      tokenExpiresAt: freshState.auth.tokenExpiresAt ?? null,
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
  const records = await fetchSleepRecordsForRange(accessToken, window.startDay, window.endDay);
  const baseline =
    mode === 'manual'
      ? rebuildManualBaseline(now, records)
      : rebuildAutomaticBaseline(now, records);
  updateState({ baseline });
  printJson(baseline);
}

export async function runMorningSummary(textMode: boolean): Promise<void> {
  const day = getTodayIsoDate();
  const accessToken = await ensureValidAccessToken();
  const data = await fetchTodaySummaryInputs(accessToken, day);
  const summary = buildMorningSummary({ day, ...data });

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

export async function runMorningOptimized(): Promise<void> {
  const day = getTodayIsoDate();
  const accessToken = await ensureValidAccessToken();
  const summaryInputs = await fetchTodaySummaryInputs(accessToken, day);
  let state = readState();
  let baseline = state.baseline;
  let baselineStatus: 'ready' | 'missing' | 'stale' | 'refresh_failed' = baseline
    ? 'ready'
    : 'missing';

  if (!baseline || isBaselineStale(baseline, new Date())) {
    baselineStatus = baseline ? 'stale' : 'missing';
    try {
      const window = getAutomaticBaselineWindow(new Date());
      const records = await fetchSleepRecordsForRange(accessToken, window.startDay, window.endDay);
      baseline = rebuildAutomaticBaseline(new Date(), records);
      state = updateState({ baseline });
      baseline = state.baseline;
      baselineStatus = 'ready';
    } catch {
      baselineStatus = 'refresh_failed';
    }
  }

  const result = evaluateMorningOptimized({
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
    baseline,
    baselineStatus,
  });

  printJson(result);
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

  const auth = program.command('auth').description('Inspect and refresh auth state');
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
    .option('--text', 'Print sendable text')
    .action(async (options: { text?: boolean }) => {
      await runMorningSummary(Boolean(options.text));
    });
  summary.command('morning-optimized').action(runMorningOptimized);
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
