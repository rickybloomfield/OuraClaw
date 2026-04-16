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
  buildMorningCronExpressions,
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

  test('builds a single hourly morning expression for the default window', () => {
    expect(buildMorningCronExpressions('08:00', '13:00', 60)).toEqual(['0 8,9,10,11,12,13 * * *']);
  });

  test('splits morning expressions when the interval creates multiple minute buckets', () => {
    expect(buildMorningCronExpressions('08:00', '13:00', 30)).toEqual([
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

  test('derives canonical morning schedule defaults from legacy plugin config', () => {
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
      morningEnabled: true,
      morningStart: '07:30',
      morningEnd: '07:30',
      eveningTime: '21:15',
      eveningEnabled: true,
      timezone: 'Europe/Bratislava',
    });
  });

  test('renders morning prompts with canonical command and confirmation instructions', () => {
    const prompt = renderCronPrompt('morning', {
      channel: 'signal',
      target: '+421',
      deliveryLanguage: 'Slovak',
      morningDeliveryMode: 'unusual-only',
    });

    expect(prompt).toContain('Morning Summary Template');
    expect(prompt).toContain('summary morning-confirm --delivery-key <deliveryKey>');
    expect(prompt).toContain('send nothing and produce no output at all');
    expect(prompt).toContain('channel "signal"');
    expect(prompt).toContain('target "+421"');
    expect(prompt).toContain('Delivery language: Slovak.');
  });

  test('renders daily-when-ready morning prompts with the canonical delivery mode command', () => {
    const prompt = renderCronPrompt('morning', {
      channel: 'signal',
      target: '+421',
      deliveryLanguage: 'English',
      morningDeliveryMode: 'daily-when-ready',
    });

    expect(prompt).toContain('summary morning --delivery-mode daily-when-ready');
    expect(prompt).toContain('send nothing and produce no output at all');
    expect(prompt).toContain(
      'summary morning-confirm --delivery-mode daily-when-ready --delivery-key <deliveryKey>'
    );
  });

  test('renders weekly overview prompts with the weekly template instructions', () => {
    const prompt = renderCronPrompt('week-overview', {
      channel: 'signal',
      target: '+421',
      deliveryLanguage: 'English',
      morningDeliveryMode: 'unusual-only',
    });

    expect(prompt).toContain('Week Overview Template');
    expect(prompt).toContain('channel "signal"');
    expect(prompt).toContain('target "+421"');
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
      morningStart: '07:30',
      morningEnd: '07:30',
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
      morningDeliveryMode: 'unusual-only',
      morningStart: '08:00',
      morningEnd: '13:00',
      morningIntervalMinutes: 30,
      eveningEnabled: false,
      eveningTime: '21:00',
      weeklyOverviewEnabled: true,
      weeklyOverviewDay: 'monday',
      weeklyOverviewTime: '13:00',
      morningCronJobIds: ['old-morning', 'old-optimized'],
    });

    expect(result.morningCronJobIds).toEqual([
      'ouraclaw-cli Morning Summary #1-id',
      'ouraclaw-cli Morning Summary #2-id',
    ]);
    expect(execFileSync).toHaveBeenCalledWith(
      'openclaw',
      expect.arrayContaining(['cron', 'add', '--name', 'ouraclaw-cli Morning Summary #1']),
      expect.objectContaining({ encoding: 'utf8', timeout: 10000 })
    );
    expect(result.weeklyOverviewCronJobId).toBe('ouraclaw-cli Weekly Overview-id');
    expect(execFileSync).toHaveBeenCalledWith(
      'openclaw',
      expect.arrayContaining([
        'cron',
        'add',
        '--name',
        'ouraclaw-cli Weekly Overview',
        '--cron',
        '0 13 * * 1',
      ]),
      expect.objectContaining({ encoding: 'utf8', timeout: 10000 })
    );
  });

  test('removes managed jobs and reports schedule status', () => {
    let jobs = [
      { id: 'morning-1', name: 'ouraclaw-cli Morning Summary #1' },
      { id: 'morning-2', name: 'ouraclaw-cli Morning Summary #2' },
      { id: 'weekly-1', name: 'ouraclaw-cli Weekly Overview' },
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
        morningCronJobIds: ['morning-1', 'morning-2'],
        eveningCronJobId: undefined,
        weeklyOverviewCronJobId: 'weekly-1',
      })
    ).toEqual({
      removedIds: ['morning-1', 'morning-2', 'weekly-1'],
    });

    const status = getScheduleStatus({
      enabled: true,
      timezone: 'Europe/Bratislava',
      deliveryLanguage: 'English',
      channel: 'signal',
      target: '+421111',
      morningEnabled: true,
      morningDeliveryMode: 'unusual-only',
      morningStart: '08:00',
      morningEnd: '13:00',
      morningIntervalMinutes: 60,
      morningCronJobIds: ['morning-1', 'morning-2'],
      eveningEnabled: false,
      eveningTime: '21:00',
      weeklyOverviewEnabled: true,
      weeklyOverviewDay: 'monday',
      weeklyOverviewTime: '13:00',
      weeklyOverviewCronJobId: 'weekly-1',
    });

    expect(status.existingManagedJobs).toEqual([]);
    expect(status.existingLegacyJobs).toEqual([
      { id: 'legacy-id', name: 'OuraClaw Evening Summary' },
    ]);
  });

  test('exports managed and legacy job name helpers', () => {
    expect(getLegacyJobNames()).toContain('ouraclaw-morning');
    expect(getManagedJobNames()).toEqual({
      morningPrefix: 'ouraclaw-cli Morning Summary',
      evening: 'ouraclaw-cli Evening Summary',
      weeklyOverview: 'ouraclaw-cli Weekly Overview',
    });
  });
});
