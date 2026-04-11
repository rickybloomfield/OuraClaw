import { beforeEach, describe, expect, test, vi } from 'vitest';

const { execFileSync, readFileSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync,
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync,
  },
}));

import {
  buildOptimizedWatcherCronExpressions,
  createOrReplaceScheduleJobs,
  findLegacyOuraClawJobs,
  getConfiguredChannelTargets,
  getLegacyJobNames,
  getLegacyScheduleDefaults,
  getManagedJobNames,
  getScheduleStatus,
  inspectLegacySchedule,
  isOpenClawAvailable,
  listOpenClawCronJobs,
  removeLegacyOuraClawJobs,
  removeManagedScheduleJobs,
  renderCronPrompt,
} from '../src/schedule';

describe('schedule helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('builds a single hourly watcher expression for the default window', () => {
    expect(buildOptimizedWatcherCronExpressions('08:00', '13:00', 60)).toEqual([
      '0 8,9,10,11,12,13 * * *',
    ]);
  });

  test('splits watcher expressions when the interval creates multiple minute buckets', () => {
    expect(buildOptimizedWatcherCronExpressions('08:00', '13:00', 30)).toEqual([
      '0 8,9,10,11,12,13 * * *',
      '30 8,9,10,11,12 * * *',
    ]);
  });

  test('finds legacy plugin jobs by known names', () => {
    expect(
      findLegacyOuraClawJobs([
        { id: '1', name: 'OuraClaw Morning Summary' },
        { id: '2', name: 'ouraclaw-cli Morning Summary' },
        { id: '3', name: 'ouraclaw-evening' },
      ])
    ).toEqual([
      { id: '1', name: 'OuraClaw Morning Summary' },
      { id: '3', name: 'ouraclaw-evening' },
    ]);
  });

  test('derives schedule defaults from legacy plugin config', () => {
    expect(
      getLegacyScheduleDefaults({
        preferredChannel: 'signal',
        preferredChannelTarget: '+421',
        morningTime: '07:30',
        eveningTime: '21:15',
        timezone: 'Europe/Bratislava',
        scheduledMessages: true,
      })
    ).toEqual({
      channel: 'signal',
      target: '+421',
      morningTime: '07:30',
      morningEnabled: true,
      eveningTime: '21:15',
      eveningEnabled: true,
      timezone: 'Europe/Bratislava',
    });
  });

  test('renders optimized watcher prompts with language and confirmation instructions', () => {
    const prompt = renderCronPrompt('optimizedWatcher', {
      channel: 'signal',
      target: '+421',
      deliveryLanguage: 'Slovak',
      optimizedWatcherDeliveryMode: 'unusual-only',
    });

    expect(prompt).toContain('Morning Optimized Template');
    expect(prompt).toContain('summary morning-optimized-confirm --delivery-key <deliveryKey>');
    expect(prompt).toContain('send nothing and produce no output at all');
    expect(prompt).toContain('channel "signal"');
    expect(prompt).toContain('target "+421"');
    expect(prompt).toContain('Delivery language: Slovak.');
  });

  test('renders daily-when-ready watcher prompts with the delivery mode command', () => {
    const prompt = renderCronPrompt('optimizedWatcher', {
      channel: 'signal',
      target: '+421',
      deliveryLanguage: 'English',
      optimizedWatcherDeliveryMode: 'daily-when-ready',
    });

    expect(prompt).toContain('summary morning-optimized --delivery-mode daily-when-ready');
    expect(prompt).toContain('send nothing and produce no output at all');
    expect(prompt).toContain('ready-day branch of this optimized watcher');
    expect(prompt).toContain('Use the nested morningSummary payload only as extra context');
    expect(prompt).toContain(
      'summary morning-optimized-confirm --delivery-mode daily-when-ready --delivery-key <deliveryKey>'
    );
  });

  test('detects whether openclaw is available', () => {
    execFileSync.mockReturnValue('OpenClaw 2026.3.11');
    expect(isOpenClawAvailable()).toBe(true);

    execFileSync.mockImplementationOnce(() => {
      throw new Error('missing');
    });
    expect(isOpenClawAvailable()).toBe(false);
  });

  test('lists cron jobs and configured channel targets from openclaw', () => {
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'cron' && args[1] === 'list') {
        return JSON.stringify({
          jobs: [
            { id: 'job-1', name: 'ouraclaw-cli Morning Summary', cron: '30 7 * * *' },
            { id: 'legacy-1', name: 'OuraClaw Morning Summary' },
          ],
        });
      }
      if (args[0] === 'channels' && args[1] === 'list') {
        return JSON.stringify({ chat: { signal: {}, slack: {} } });
      }
      if (args[0] === 'config' && args[1] === 'get' && args[2] === 'channels.signal') {
        return JSON.stringify({ allowFrom: ['+421111'] });
      }
      if (args[0] === 'config' && args[1] === 'get' && args[2] === 'channels.slack') {
        return JSON.stringify({ allowFrom: ['team-room'] });
      }
      return '';
    });

    expect(listOpenClawCronJobs()).toEqual([
      { id: 'job-1', name: 'ouraclaw-cli Morning Summary', cron: '30 7 * * *' },
      { id: 'legacy-1', name: 'OuraClaw Morning Summary' },
    ]);
    expect(getConfiguredChannelTargets()).toEqual([
      { label: 'signal -> +421111', channel: 'signal', target: '+421111' },
      { label: 'slack -> team-room', channel: 'slack', target: 'team-room' },
    ]);
  });

  test('inspects legacy config and removes legacy jobs', () => {
    readFileSync.mockReturnValue(
      JSON.stringify({
        preferredChannel: 'signal',
        preferredChannelTarget: '+421111',
        morningTime: '07:30',
        timezone: 'Europe/Bratislava',
        morningCronJobId: 'legacy-morning-id',
      })
    );
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'cron' && args[1] === 'remove') {
        return '';
      }
      return '';
    });

    const legacyJobs = [
      { id: 'legacy-1', name: 'OuraClaw Morning Summary' },
      { id: 'legacy-2', name: 'ouraclaw-evening' },
    ];
    const inspection = inspectLegacySchedule(legacyJobs);
    const removal = removeLegacyOuraClawJobs(inspection.legacyConfig, legacyJobs);

    expect(inspection.legacyDefaults).toEqual({
      channel: 'signal',
      target: '+421111',
      morningEnabled: true,
      morningTime: '07:30',
      timezone: 'Europe/Bratislava',
    });
    expect(removal).toEqual({
      foundIds: ['legacy-morning-id', 'legacy-1', 'legacy-2'],
      removedIds: ['legacy-morning-id', 'legacy-1', 'legacy-2'],
    });
  });

  test('creates and replaces managed schedule jobs', () => {
    let jobs = [
      { id: 'old-morning', name: 'ouraclaw-cli Morning Summary' },
      { id: 'old-optimized', name: 'ouraclaw-cli Morning Optimized' },
    ];
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') {
        return 'OpenClaw 2026.3.11';
      }
      if (args[0] === 'cron' && args[1] === 'list') {
        return JSON.stringify(jobs);
      }
      if (args[0] === 'cron' && args[1] === 'remove') {
        jobs = jobs.filter((job) => job.id !== args[2]);
        return '';
      }
      if (args[0] === 'cron' && args[1] === 'add') {
        const name = args[args.indexOf('--name') + 1];
        jobs.push({ id: `${name}-id`, name });
        return '';
      }
      return '';
    });

    const result = createOrReplaceScheduleJobs({
      enabled: true,
      timezone: 'Europe/Bratislava',
      deliveryLanguage: 'English',
      channel: 'signal',
      target: '+421111',
      morningEnabled: true,
      morningTime: '07:30',
      eveningEnabled: false,
      eveningTime: '21:00',
      optimizedWatcherEnabled: true,
      optimizedWatcherDeliveryMode: 'unusual-only',
      optimizedWatcherStart: '08:00',
      optimizedWatcherEnd: '13:00',
      optimizedWatcherIntervalMinutes: 30,
      morningCronJobId: 'old-morning',
      optimizedWatcherCronJobIds: ['old-optimized'],
    });

    expect(result.morningCronJobId).toBe('ouraclaw-cli Morning Summary-id');
    expect(result.optimizedWatcherCronJobIds).toEqual([
      'ouraclaw-cli Morning Optimized #1-id',
      'ouraclaw-cli Morning Optimized #2-id',
    ]);
    expect(execFileSync).toHaveBeenCalledWith(
      'openclaw',
      expect.arrayContaining(['cron', 'add', '--name', 'ouraclaw-cli Morning Summary']),
      expect.objectContaining({ encoding: 'utf8', timeout: 10000 })
    );
  });

  test('removes managed jobs and reports schedule status', () => {
    let jobs = [
      { id: 'morning-id', name: 'ouraclaw-cli Morning Summary' },
      { id: 'optimized-id', name: 'ouraclaw-cli Morning Optimized' },
      { id: 'legacy-id', name: 'OuraClaw Evening Summary' },
    ];
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === '--version') {
        return 'OpenClaw 2026.3.11';
      }
      if (args[0] === 'cron' && args[1] === 'list') {
        return JSON.stringify(jobs);
      }
      if (args[0] === 'cron' && args[1] === 'remove') {
        jobs = jobs.filter((job) => job.id !== args[2]);
        return '';
      }
      return '';
    });

    expect(
      removeManagedScheduleJobs({
        morningCronJobId: 'morning-id',
        eveningCronJobId: undefined,
        optimizedWatcherCronJobIds: ['optimized-id'],
      })
    ).toEqual({
      removedIds: ['morning-id', 'optimized-id'],
    });

    const status = getScheduleStatus({
      enabled: true,
      timezone: 'Europe/Bratislava',
      deliveryLanguage: 'English',
      channel: 'signal',
      target: '+421111',
      morningEnabled: true,
      morningTime: '07:30',
      eveningEnabled: false,
      eveningTime: '21:00',
      optimizedWatcherEnabled: false,
      optimizedWatcherDeliveryMode: 'unusual-only',
      optimizedWatcherStart: '08:00',
      optimizedWatcherEnd: '13:00',
      optimizedWatcherIntervalMinutes: 60,
      morningCronJobId: 'morning-id',
      optimizedWatcherCronJobIds: [],
    });

    expect(status.existingManagedJobs).toEqual([]);
    expect(status.existingLegacyJobs).toEqual([
      { id: 'legacy-id', name: 'OuraClaw Evening Summary' },
    ]);
  });

  test('exports managed and legacy job name helpers', () => {
    expect(getLegacyJobNames()).toContain('ouraclaw-morning');
    expect(getManagedJobNames()).toEqual({
      morning: 'ouraclaw-cli Morning Summary',
      evening: 'ouraclaw-cli Evening Summary',
      optimizedWatcherPrefix: 'ouraclaw-cli Morning Optimized',
    });
  });
});
