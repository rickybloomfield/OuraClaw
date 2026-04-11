import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getLegacyConfigFilePath } from './config';
import { LegacyOuraConfig, OptimizedWatcherDeliveryMode, ScheduleConfig } from './types';

export interface OpenClawCronJob {
  id: string;
  name: string;
  cron?: string;
  tz?: string;
  session?: string;
  message?: string;
}

export interface ChannelTarget {
  label: string;
  channel: string;
  target: string;
}

export interface LegacyScheduleInspection {
  legacyConfigPath: string;
  legacyConfig?: LegacyOuraConfig;
  legacyDefaults?: Partial<ScheduleConfig>;
  legacyJobs: OpenClawCronJob[];
}

export interface ScheduleStatusResult {
  openclawAvailable: boolean;
  configured: ScheduleConfig;
  existingManagedJobs: OpenClawCronJob[];
  existingLegacyJobs: OpenClawCronJob[];
}

interface ManagedCronJobDefinition {
  kind: 'morning' | 'evening' | 'optimizedWatcher';
  name: string;
  cron: string;
  message: string;
}

const MANAGED_JOB_NAMES = {
  morning: 'ouraclaw-cli Morning Summary',
  evening: 'ouraclaw-cli Evening Summary',
  optimizedWatcherPrefix: 'ouraclaw-cli Morning Optimized',
} as const;

const LEGACY_JOB_NAMES = [
  'OuraClaw Morning Summary',
  'OuraClaw Evening Summary',
  'ouraclaw-morning',
  'ouraclaw-evening',
] as const;

const SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'oura', 'SKILL.md');

function runOpenClaw(args: string[]): string {
  return execFileSync('openclaw', args, {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function parseCronListOutput(output: string): OpenClawCronJob[] {
  const parsed = JSON.parse(output) as unknown;
  const jobs = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { jobs?: unknown[] }).jobs)
      ? (parsed as { jobs: unknown[] }).jobs
      : [];

  return jobs
    .filter((job): job is Record<string, unknown> => Boolean(job) && typeof job === 'object')
    .map((job) => ({
      id: String(job.id ?? ''),
      name: String(job.name ?? ''),
      cron: typeof job.cron === 'string' ? job.cron : undefined,
      tz: typeof job.tz === 'string' ? job.tz : undefined,
      session: typeof job.session === 'string' ? job.session : undefined,
      message: typeof job.message === 'string' ? job.message : undefined,
    }))
    .filter((job) => job.id.length > 0 && job.name.length > 0);
}

export function isOpenClawAvailable(): boolean {
  try {
    runOpenClaw(['--version']);
    return true;
  } catch {
    return false;
  }
}

export function listOpenClawCronJobs(): OpenClawCronJob[] {
  try {
    return parseCronListOutput(runOpenClaw(['cron', 'list', '--json']));
  } catch {
    return [];
  }
}

function getChannelConfig(channelId: string): Record<string, unknown> | null {
  try {
    return JSON.parse(runOpenClaw(['config', 'get', `channels.${channelId}`])) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export function getConfiguredChannelTargets(): ChannelTarget[] {
  try {
    const raw = JSON.parse(runOpenClaw(['channels', 'list', '--json', '--no-usage'])) as {
      chat?: Record<string, unknown>;
    };
    const channelIds = raw.chat && typeof raw.chat === 'object' ? Object.keys(raw.chat) : [];
    const targets: ChannelTarget[] = [];

    for (const channelId of channelIds) {
      const config = getChannelConfig(channelId);
      const allowFrom = Array.isArray(config?.allowFrom)
        ? config.allowFrom.filter((value): value is string => typeof value === 'string')
        : [];
      for (const target of allowFrom) {
        targets.push({
          label: `${channelId} -> ${target}`,
          channel: channelId,
          target,
        });
      }
    }

    return targets;
  } catch {
    return [];
  }
}

export function isValidTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseTimeOfDay(value: string): { hours: number; minutes: number; totalMinutes: number } {
  if (!isValidTimeOfDay(value)) {
    throw new Error(`Invalid time value: ${value}. Expected HH:MM.`);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
  };
}

function timeToDailyCron(value: string): string {
  const { hours, minutes } = parseTimeOfDay(value);
  return `${minutes} ${hours} * * *`;
}

function joinSortedNumbers(values: number[]): string {
  return [...values].sort((left, right) => left - right).join(',');
}

export function buildOptimizedWatcherCronExpressions(
  start: string,
  end: string,
  intervalMinutes: number
): string[] {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error('Optimized watcher interval must be a positive whole number of minutes.');
  }

  const startTime = parseTimeOfDay(start);
  const endTime = parseTimeOfDay(end);
  if (endTime.totalMinutes < startTime.totalMinutes) {
    throw new Error('Optimized watcher end time must be at or after the start time.');
  }

  const occurrences: { hours: number; minutes: number }[] = [];
  for (
    let current = startTime.totalMinutes;
    current <= endTime.totalMinutes;
    current += intervalMinutes
  ) {
    const hours = Math.floor(current / 60);
    const minutes = current % 60;
    occurrences.push({ hours, minutes });
  }

  const groupedByMinute = new Map<number, number[]>();
  for (const occurrence of occurrences) {
    const hours = groupedByMinute.get(occurrence.minutes) ?? [];
    hours.push(occurrence.hours);
    groupedByMinute.set(occurrence.minutes, hours);
  }

  return [...groupedByMinute.entries()]
    .sort(([leftMinute], [rightMinute]) => leftMinute - rightMinute)
    .map(([minute, hours]) => `${minute} ${joinSortedNumbers(hours)} * * *`);
}

function isManagedOptimizedWatcherJobName(name: string): boolean {
  return name.startsWith(MANAGED_JOB_NAMES.optimizedWatcherPrefix);
}

export function isManagedScheduleJob(job: Pick<OpenClawCronJob, 'name'>): boolean {
  return (
    job.name === MANAGED_JOB_NAMES.morning ||
    job.name === MANAGED_JOB_NAMES.evening ||
    isManagedOptimizedWatcherJobName(job.name)
  );
}

export function findLegacyOuraClawJobs(jobs: OpenClawCronJob[]): OpenClawCronJob[] {
  return jobs.filter((job) =>
    LEGACY_JOB_NAMES.includes(job.name as (typeof LEGACY_JOB_NAMES)[number])
  );
}

export function findManagedScheduleJobs(jobs: OpenClawCronJob[]): OpenClawCronJob[] {
  return jobs.filter((job) => isManagedScheduleJob(job));
}

export function getLegacyScheduleDefaults(
  legacyConfig: LegacyOuraConfig | undefined
): Partial<ScheduleConfig> | undefined {
  if (!legacyConfig) {
    return undefined;
  }

  const defaults: Partial<ScheduleConfig> = {};
  if (legacyConfig.timezone) {
    defaults.timezone = legacyConfig.timezone;
  }
  if (legacyConfig.preferredChannel) {
    defaults.channel = legacyConfig.preferredChannel;
  }
  if (legacyConfig.preferredChannelTarget) {
    defaults.target = legacyConfig.preferredChannelTarget;
  }
  if (legacyConfig.morningTime) {
    defaults.morningTime = legacyConfig.morningTime;
    defaults.morningEnabled = legacyConfig.scheduledMessages ?? true;
  }
  if (legacyConfig.eveningTime) {
    defaults.eveningTime = legacyConfig.eveningTime;
    defaults.eveningEnabled = legacyConfig.scheduledMessages ?? true;
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined;
}

export function inspectLegacySchedule(jobs = listOpenClawCronJobs()): LegacyScheduleInspection {
  const legacyConfigPath = getLegacyConfigFilePath();
  const legacyConfig = safeReadJson<LegacyOuraConfig>(legacyConfigPath) ?? undefined;
  return {
    legacyConfigPath,
    legacyConfig,
    legacyDefaults: getLegacyScheduleDefaults(legacyConfig),
    legacyJobs: findLegacyOuraClawJobs(jobs),
  };
}

export function renderCronPrompt(
  type: 'morning' | 'evening' | 'optimizedWatcher',
  schedule: Pick<
    ScheduleConfig,
    'channel' | 'target' | 'deliveryLanguage' | 'optimizedWatcherDeliveryMode'
  >
): string {
  const destination = `Deliver directly to channel "${schedule.channel ?? 'default'}" and target "${schedule.target ?? 'default'}".`;
  const language = `Delivery language: ${schedule.deliveryLanguage}.`;

  if (type === 'morning') {
    return `Read ${SKILL_PATH} and follow the Morning Summary Template. ${destination} ${language}`;
  }
  if (type === 'evening') {
    return `Read ${SKILL_PATH} and follow the Evening Summary Template. ${destination} ${language}`;
  }
  const deliveryMode: OptimizedWatcherDeliveryMode =
    schedule.optimizedWatcherDeliveryMode ?? 'unusual-only';
  const command =
    deliveryMode === 'daily-when-ready'
      ? 'ouraclaw-cli summary morning-optimized --delivery-mode daily-when-ready'
      : 'ouraclaw-cli summary morning-optimized';
  const confirmCommand =
    deliveryMode === 'daily-when-ready'
      ? 'ouraclaw-cli summary morning-optimized-confirm --delivery-mode daily-when-ready --delivery-key <deliveryKey>'
      : 'ouraclaw-cli summary morning-optimized-confirm --delivery-key <deliveryKey>';
  const noOutputInstruction =
    'If dataReady is false or shouldSend is false, send nothing and produce no output at all. Do not post a status message, explanation, acknowledgment, or skip notice.';
  const modeInstruction =
    deliveryMode === 'daily-when-ready'
      ? `${noOutputInstruction} If shouldSend is true, follow the Morning Optimized Template. Treat deliveryType "morning-summary" as the ready-day branch of this optimized watcher, not as a separate scheduler. Use the nested morningSummary payload only as extra context.`
      : `${noOutputInstruction} If shouldSend is true, follow the Morning Optimized Template.`;
  return `Read ${SKILL_PATH}. Run ${command}. ${modeInstruction} Confirm successful delivery with ${confirmCommand} only after the send succeeds. ${destination} ${language}`;
}

function buildManagedCronJobs(schedule: ScheduleConfig): ManagedCronJobDefinition[] {
  const jobs: ManagedCronJobDefinition[] = [];
  if (schedule.morningEnabled) {
    jobs.push({
      kind: 'morning',
      name: MANAGED_JOB_NAMES.morning,
      cron: timeToDailyCron(schedule.morningTime),
      message: renderCronPrompt('morning', schedule),
    });
  }
  if (schedule.eveningEnabled) {
    jobs.push({
      kind: 'evening',
      name: MANAGED_JOB_NAMES.evening,
      cron: timeToDailyCron(schedule.eveningTime),
      message: renderCronPrompt('evening', schedule),
    });
  }
  if (schedule.optimizedWatcherEnabled) {
    const expressions = buildOptimizedWatcherCronExpressions(
      schedule.optimizedWatcherStart,
      schedule.optimizedWatcherEnd,
      schedule.optimizedWatcherIntervalMinutes
    );
    for (const [index, cron] of expressions.entries()) {
      jobs.push({
        kind: 'optimizedWatcher',
        name:
          expressions.length === 1
            ? MANAGED_JOB_NAMES.optimizedWatcherPrefix
            : `${MANAGED_JOB_NAMES.optimizedWatcherPrefix} #${index + 1}`,
        cron,
        message: renderCronPrompt('optimizedWatcher', schedule),
      });
    }
  }
  return jobs;
}

function removeCronJobsByIds(ids: string[]): string[] {
  const removed: string[] = [];
  for (const id of ids) {
    if (!id) {
      continue;
    }
    try {
      runOpenClaw(['cron', 'remove', id]);
      removed.push(id);
    } catch {
      // Job may already be gone.
    }
  }
  return removed;
}

function createCronJob(job: ManagedCronJobDefinition, timezone: string): string {
  runOpenClaw([
    'cron',
    'add',
    '--name',
    job.name,
    '--cron',
    job.cron,
    '--tz',
    timezone,
    '--session',
    'isolated',
    '--message',
    job.message,
    '--no-deliver',
  ]);

  const matching = listOpenClawCronJobs().find((existing) => existing.name === job.name);
  if (!matching) {
    throw new Error(`Unable to find created OpenClaw cron job: ${job.name}`);
  }
  return matching.id;
}

export function removeManagedScheduleJobs(
  schedule: Pick<
    ScheduleConfig,
    'morningCronJobId' | 'eveningCronJobId' | 'optimizedWatcherCronJobIds'
  >
): { removedIds: string[] } {
  const jobs = listOpenClawCronJobs();
  const ids = new Set<string>([
    schedule.morningCronJobId ?? '',
    schedule.eveningCronJobId ?? '',
    ...(schedule.optimizedWatcherCronJobIds ?? []),
    ...findManagedScheduleJobs(jobs).map((job) => job.id),
  ]);

  return {
    removedIds: removeCronJobsByIds([...ids].filter(Boolean)),
  };
}

export function createOrReplaceScheduleJobs(schedule: ScheduleConfig): ScheduleConfig {
  if (!isOpenClawAvailable()) {
    throw new Error('openclaw is not installed or not available on PATH.');
  }
  if (!schedule.channel || !schedule.target) {
    throw new Error('Scheduled delivery requires an explicit OpenClaw channel and target.');
  }
  if (!isValidTimezone(schedule.timezone)) {
    throw new Error(`Invalid timezone: ${schedule.timezone}`);
  }

  removeManagedScheduleJobs(schedule);

  const jobIds = {
    morningCronJobId: undefined as string | undefined,
    eveningCronJobId: undefined as string | undefined,
    optimizedWatcherCronJobIds: [] as string[],
  };

  for (const job of buildManagedCronJobs(schedule)) {
    const id = createCronJob(job, schedule.timezone);
    if (job.kind === 'morning') {
      jobIds.morningCronJobId = id;
    } else if (job.kind === 'evening') {
      jobIds.eveningCronJobId = id;
    } else {
      jobIds.optimizedWatcherCronJobIds.push(id);
    }
  }

  return {
    ...schedule,
    enabled: schedule.morningEnabled || schedule.eveningEnabled || schedule.optimizedWatcherEnabled,
    morningCronJobId: jobIds.morningCronJobId,
    eveningCronJobId: jobIds.eveningCronJobId,
    optimizedWatcherCronJobIds: jobIds.optimizedWatcherCronJobIds,
  };
}

export function removeLegacyOuraClawJobs(
  legacyConfig: LegacyOuraConfig | undefined,
  jobs = listOpenClawCronJobs()
): { removedIds: string[]; foundIds: string[] } {
  const ids = new Set<string>([
    legacyConfig?.morningCronJobId ?? '',
    legacyConfig?.eveningCronJobId ?? '',
    ...findLegacyOuraClawJobs(jobs).map((job) => job.id),
  ]);
  const foundIds = [...ids].filter(Boolean);
  return {
    foundIds,
    removedIds: removeCronJobsByIds(foundIds),
  };
}

export function getScheduleStatus(schedule: ScheduleConfig): ScheduleStatusResult {
  const openclawAvailable = isOpenClawAvailable();
  const jobs = openclawAvailable ? listOpenClawCronJobs() : [];
  return {
    openclawAvailable,
    configured: schedule,
    existingManagedJobs: findManagedScheduleJobs(jobs),
    existingLegacyJobs: findLegacyOuraClawJobs(jobs),
  };
}

export function getLegacyJobNames(): string[] {
  return [...LEGACY_JOB_NAMES];
}

export function getManagedJobNames(): {
  morning: string;
  evening: string;
  optimizedWatcherPrefix: string;
} {
  return { ...MANAGED_JOB_NAMES };
}
