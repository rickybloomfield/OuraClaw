import { beforeEach, describe, expect, test, vi } from 'vitest';

const printJson = vi.fn();
const printText = vi.fn();
const ensureValidAccessToken = vi.fn();
const getAuthStatus = vi.fn();
const refreshStoredAuth = vi.fn();
const tokenResponseToAuthPatch = vi.fn();
const fetchOuraData = vi.fn();
const readState = vi.fn();
const updateState = vi.fn();
const writeState = vi.fn();
const rebuildAutomaticBaseline = vi.fn();
const rebuildManualBaseline = vi.fn();
const validateBaselineConfig = vi.fn((config) => config);
const isBaselineStale = vi.fn();
const evaluateMorningOptimized = vi.fn();
const buildMorningSummary = vi.fn();
const buildEveningSummary = vi.fn();
const getScheduleStatus = vi.fn();
const removeManagedScheduleJobs = vi.fn();
const listOpenClawCronJobs = vi.fn();
const inspectLegacySchedule = vi.fn();
const removeLegacyOuraClawJobs = vi.fn();
const readlineQuestion = vi.fn();
const readlineClose = vi.fn();
const createInterface = vi.fn(() => ({
  question: readlineQuestion,
  close: readlineClose,
  input: { isTTY: false },
  output: { write: vi.fn() },
}));
const buildAuthorizeUrl = vi.fn();
const captureOAuthCallback = vi.fn();
const exchangeCodeForTokens = vi.fn();

vi.mock('node:readline/promises', () => ({
  default: {
    createInterface,
  },
}));

vi.mock('../src/output', () => ({
  printJson,
  printText,
}));

vi.mock('../src/auth', () => ({
  ensureValidAccessToken,
  getAuthStatus,
  refreshStoredAuth,
  tokenResponseToAuthPatch,
}));

vi.mock('../src/oauth', () => ({
  buildAuthorizeUrl,
  captureOAuthCallback,
  exchangeCodeForTokens,
}));

vi.mock('../src/oura-client', () => ({
  fetchOuraData,
}));

vi.mock('../src/state-store', () => ({
  defaultState: vi.fn(),
  readState,
  updateState,
  writeState,
}));

vi.mock('../src/baseline', () => ({
  getAutomaticBaselineWindow: vi.fn(() => ({
    startDay: '2026-02-16',
    endDay: '2026-03-08',
    weeks: ['2026-W08'],
  })),
  getManualBaselineWindow: vi.fn(() => ({ startDay: '2026-02-20', endDay: '2026-03-12' })),
  isBaselineStale,
  rebuildAutomaticBaseline,
  rebuildManualBaseline,
  validateBaselineConfig,
}));

vi.mock('../src/morning-optimized', () => ({
  evaluateMorningOptimized,
}));

vi.mock('../src/schedule', () => ({
  createOrReplaceScheduleJobs: vi.fn(),
  getConfiguredChannelTargets: vi.fn(() => []),
  getLegacyScheduleDefaults: vi.fn(() => undefined),
  getScheduleStatus,
  inspectLegacySchedule,
  isOpenClawAvailable: vi.fn(() => false),
  isValidTimeOfDay: vi.fn(() => true),
  isValidTimezone: vi.fn(() => true),
  listOpenClawCronJobs,
  removeLegacyOuraClawJobs,
  removeManagedScheduleJobs,
}));

vi.mock('../src/summaries', () => ({
  buildMorningSummary,
  buildEveningSummary,
  selectPreferredSleepRecord: vi.fn((records) => records[0]),
}));

describe('cli actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenResponseToAuthPatch.mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenExpiresAt: 1776000000000,
    });
    buildAuthorizeUrl.mockReturnValue({
      authorizeUrl: 'https://cloud.ouraring.com/oauth/authorize',
      state: 'oauth-state',
      codeVerifier: '',
      redirectUri: 'http://localhost:9876/callback',
    });
    captureOAuthCallback.mockResolvedValue('oauth-code');
    exchangeCodeForTokens.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });
  });

  test('resolves fetch date range defaults and single dates', async () => {
    const { resolveDateRange } = await import('../src/cli');

    expect(resolveDateRange(undefined, undefined)).toEqual({
      start: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
      end: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
    });
    expect(resolveDateRange('2026-03-13', undefined)).toEqual({
      start: '2026-03-13',
      end: '2026-03-13',
    });
  });

  test('resolves week overview date ranges as seven inclusive days', async () => {
    const { resolveWeekOverviewDateRange } = await import('../src/cli');

    expect(resolveWeekOverviewDateRange('2026-04-04', undefined)).toEqual({
      start: '2026-04-04',
      end: '2026-04-10',
      mode: 'custom',
      days: [
        '2026-04-04',
        '2026-04-05',
        '2026-04-06',
        '2026-04-07',
        '2026-04-08',
        '2026-04-09',
        '2026-04-10',
      ],
    });
    expect(resolveWeekOverviewDateRange(undefined, '2026-04-10')).toMatchObject({
      start: '2026-04-04',
      end: '2026-04-10',
      mode: 'custom',
    });
    expect(() => resolveWeekOverviewDateRange('2026-04-04', '2026-04-09')).toThrow(
      'week-overview requires an inclusive 7-day range.'
    );
  });

  test('runs fetch and prints raw json', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    fetchOuraData.mockResolvedValue({ data: [{ id: 'sleep' }] });

    const { runFetch } = await import('../src/cli');
    await runFetch('daily_sleep', '2026-03-13', '2026-03-13');

    expect(fetchOuraData).toHaveBeenCalledWith('token', 'daily_sleep', '2026-03-13', '2026-03-13');
    expect(printJson).toHaveBeenCalledWith({ data: [{ id: 'sleep' }] });
  });

  test('uses explicit setup guidance for optional OpenClaw delivery', async () => {
    const {
      buildSetupCompletionMessage,
      getBaselineSensitivityExplanation,
      getScheduleSetupHandoffPrompt,
    } = await import('../src/cli');

    expect(getScheduleSetupHandoffPrompt()).toBe(
      'Setup complete. Continue with OpenClaw scheduled delivery setup'
    );
    expect(getBaselineSensitivityExplanation()).toContain(
      'lower percentile 25 means the normal band runs from the 25th to 75th percentile'
    );
    expect(
      buildSetupCompletionMessage({
        attempted: false,
        configured: false,
        provider: 'openclaw',
        available: false,
        reason: 'openclaw_unavailable',
      })
    ).toBe(
      'Setup complete. OpenClaw is not available, so OpenClaw scheduled delivery was skipped.\nThe CLI is fully usable without OpenClaw; run commands manually or connect another scheduler.'
    );
  });

  test('asks about setup re-authentication before threshold tuning', async () => {
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: 1776000000000,
      },
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      deliveries: {},
    });
    getAuthStatus.mockReturnValue({
      configured: true,
      hasAccessToken: true,
      hasRefreshToken: true,
      expired: false,
      tokenExpiresAt: 1776000000000,
    });
    readlineQuestion
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('n')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    const { runSetup } = await import('../src/cli');
    await runSetup();

    const prompts = readlineQuestion.mock.calls.map(([prompt]) => String(prompt));
    const reauthPromptIndex = prompts.findIndex((prompt) =>
      prompt.includes('Existing auth detected. Re-authenticate with Oura')
    );
    const thresholdPromptIndex = prompts.findIndex((prompt) =>
      prompt.includes('Minimum sleep score')
    );

    expect(reauthPromptIndex).toBeGreaterThanOrEqual(0);
    expect(thresholdPromptIndex).toBeGreaterThanOrEqual(0);
    expect(reauthPromptIndex).toBeLessThan(thresholdPromptIndex);
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(printJson).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        deliverySetup: expect.objectContaining({
          available: false,
          reason: 'openclaw_unavailable',
        }),
      })
    );
  });

  test('runs auth login without threshold or schedule prompts', async () => {
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      deliveries: {},
    });
    updateState.mockReturnValue({
      schemaVersion: 1,
      auth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: 1776000000000,
      },
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      deliveries: {},
    });
    readlineQuestion.mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce('n');

    const { runAuthLogin } = await import('../src/cli');
    await runAuthLogin();

    const prompts = readlineQuestion.mock.calls.map(([prompt]) => String(prompt));
    expect(prompts.some((prompt) => prompt.includes('Minimum sleep score'))).toBe(false);
    expect(prompts.some((prompt) => prompt.includes('OpenClaw scheduled delivery'))).toBe(false);
    expect(exchangeCodeForTokens).toHaveBeenCalledWith(
      'client-id',
      'client-secret',
      'oauth-code',
      '',
      'http://localhost:9876/callback'
    );
    expect(printJson).toHaveBeenCalledWith({
      ok: true,
      authenticated: true,
      tokenExpiresAt: 1776000000000,
    });
  });

  test('rebuilds manual baseline and prints it', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      deliveries: {},
    });
    fetchOuraData.mockResolvedValue({
      data: [
        {
          day: '2026-03-12',
          type: 'long_sleep',
          average_hrv: 40,
          lowest_heart_rate: 49,
          total_sleep_duration: 28000,
        },
      ],
    });
    rebuildManualBaseline.mockReturnValue({ mode: 'rolling-21-days' });

    const { rebuildBaseline } = await import('../src/cli');
    await rebuildBaseline('manual');

    expect(rebuildManualBaseline).toHaveBeenCalled();
    expect(updateState).toHaveBeenCalledWith({ baseline: { mode: 'rolling-21-days' } });
    expect(printJson).toHaveBeenCalledWith({ mode: 'rolling-21-days' });
  });

  test('fetches sleep from the previous day for range-based morning records', async () => {
    fetchOuraData
      .mockResolvedValueOnce({ data: [{ day: '2026-04-04', score: 81 }] })
      .mockResolvedValueOnce({ data: [{ day: '2026-04-04', score: 84, temperature_deviation: 0 }] })
      .mockResolvedValueOnce({
        data: [
          {
            day: '2026-04-03',
            type: 'long_sleep',
            average_hrv: 20,
            lowest_heart_rate: 62,
            total_sleep_duration: 26000,
          },
          {
            day: '2026-04-04',
            type: 'long_sleep',
            average_hrv: 21,
            lowest_heart_rate: 61,
            total_sleep_duration: 28000,
          },
        ],
      });

    const { fetchMorningBaselineRecordsForRange } = await import('../src/cli');
    const records = await fetchMorningBaselineRecordsForRange('token', '2026-04-04', '2026-04-10');

    expect(fetchOuraData).toHaveBeenNthCalledWith(3, 'token', 'sleep', '2026-04-03', '2026-04-10');
    expect(records).toEqual([
      {
        day: '2026-04-04',
        sleepScore: 81,
        readinessScore: 84,
        temperatureDeviation: 0,
        averageHrv: 21,
        lowestHeartRate: 61,
        totalSleepDuration: 28000,
      },
    ]);
  });

  test('prints morning summary text when requested', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    fetchOuraData.mockResolvedValue({ data: [] });
    buildMorningSummary.mockReturnValue({
      day: '2026-03-13',
      message: 'morning text',
      missing: [],
      payload: {},
    });

    const { runMorningSummary } = await import('../src/cli');
    await runMorningSummary(true);

    expect(printText).toHaveBeenCalledWith('morning text');
  });

  test('refreshes stale baseline during morning optimized flow', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    fetchOuraData.mockResolvedValue({ data: [] });
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      baseline: {
        updatedAt: '2026-03-01T00:00:00.000Z',
        mode: 'calendar-weeks',
        sourceStartDay: '',
        sourceEndDay: '',
        metrics: {},
      },
      deliveries: {},
    });
    isBaselineStale.mockReturnValue(true);
    updateState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      baseline: {
        mode: 'calendar-weeks',
        updatedAt: '2026-03-13T00:00:00.000Z',
        sourceStartDay: '',
        sourceEndDay: '',
        metrics: {},
      },
      deliveries: {},
    });
    rebuildAutomaticBaseline.mockReturnValue({
      mode: 'calendar-weeks',
      updatedAt: '2026-03-13T00:00:00.000Z',
      sourceStartDay: '',
      sourceEndDay: '',
      metrics: {},
    });
    evaluateMorningOptimized.mockReturnValue({
      shouldSend: false,
      shouldAlert: false,
      dataReady: true,
      alertReasons: [],
      skipReasons: [],
    });

    const { runMorningOptimized } = await import('../src/cli');
    await runMorningOptimized();

    expect(rebuildAutomaticBaseline).toHaveBeenCalled();
    expect(evaluateMorningOptimized).toHaveBeenCalled();
    expect(printJson).toHaveBeenCalledWith({
      shouldSend: false,
      shouldAlert: false,
      dataReady: true,
      alertReasons: [],
      skipReasons: [],
    });
  });

  test('records confirmed morning optimized delivery', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    fetchOuraData.mockResolvedValue({ data: [] });
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      baseline: undefined,
      deliveries: {},
    });
    isBaselineStale.mockReturnValue(false);
    evaluateMorningOptimized.mockReturnValue({
      shouldSend: true,
      shouldAlert: true,
      dataReady: true,
      alertReasons: ['sleep_below_threshold'],
      skipReasons: [],
      deliveryKey: 'abc123',
      today: {
        day: '2026-03-13',
        sleepScore: 70,
        readinessScore: 80,
        temperatureDeviation: 0,
      },
    });

    const { confirmMorningOptimizedDelivery } = await import('../src/cli');
    await confirmMorningOptimizedDelivery('abc123');

    expect(updateState).toHaveBeenCalledWith({
      deliveries: {
        morningOptimized: {
          lastDeliveredDay: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
          lastDeliveredAt: expect.any(String),
          lastDeliveryKey: 'abc123',
        },
      },
    });
    expect(printJson).toHaveBeenCalledWith({
      ok: true,
      confirmed: true,
      day: expect.stringMatching(/\d{4}-\d{2}-\d{2}/),
      deliveryKey: 'abc123',
    });
  });

  test('builds a non-revealing client secret prompt when a secret already exists', async () => {
    const { getClientSecretPrompt } = await import('../src/cli');

    expect(getClientSecretPrompt(true)).toBe('Oura Client Secret (press Enter to keep current): ');
  });

  test('detects likely headless sessions', async () => {
    const { isLikelyHeadlessSession } = await import('../src/cli');

    expect(isLikelyHeadlessSession({ SSH_CONNECTION: '1' }, 'linux')).toBe(true);
    expect(isLikelyHeadlessSession({ DISPLAY: ':0' }, 'linux')).toBe(false);
    expect(isLikelyHeadlessSession({}, 'darwin')).toBe(false);
  });

  test('offers reauthentication when an access token or refresh token exists', async () => {
    const { shouldOfferReauthentication } = await import('../src/cli');

    expect(
      shouldOfferReauthentication({
        configured: true,
        hasAccessToken: true,
        hasRefreshToken: false,
        expired: false,
        tokenExpiresAt: null,
      })
    ).toBe(true);
    expect(
      shouldOfferReauthentication({
        configured: true,
        hasAccessToken: false,
        hasRefreshToken: true,
        expired: true,
        tokenExpiresAt: null,
      })
    ).toBe(true);
    expect(
      shouldOfferReauthentication({
        configured: true,
        hasAccessToken: false,
        hasRefreshToken: false,
        expired: true,
        tokenExpiresAt: null,
      })
    ).toBe(false);
  });

  test('uses a conservative browser-open prompt in likely headless sessions', async () => {
    const { getBrowserOpenPrompt } = await import('../src/cli');

    expect(getBrowserOpenPrompt(true)).toEqual({
      question: 'This looks like a headless or SSH session. Open the OAuth URL in a browser anyway',
      defaultYes: false,
    });
    expect(getBrowserOpenPrompt(false)).toEqual({
      question: 'Open the OAuth URL in your browser now',
      defaultYes: true,
    });
  });

  test('prints schedule status with managed and legacy job information', async () => {
    const schedule = {
      enabled: true,
      timezone: 'Europe/Bratislava',
      deliveryLanguage: 'Slovak',
      channel: 'signal',
      target: '+421',
      morningEnabled: true,
      morningTime: '07:30',
      eveningEnabled: false,
      eveningTime: '21:00',
      optimizedWatcherEnabled: true,
      optimizedWatcherDeliveryMode: 'daily-when-ready',
      optimizedWatcherStart: '08:00',
      optimizedWatcherEnd: '13:00',
      optimizedWatcherIntervalMinutes: 60,
      morningCronJobId: 'job-morning',
      optimizedWatcherCronJobIds: ['job-optimized'],
    };
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      schedule,
      deliveries: {},
    });
    getScheduleStatus.mockReturnValue({
      openclawAvailable: true,
      configured: schedule,
      existingManagedJobs: [
        { id: 'job-morning', name: 'ouraclaw-cli Morning Summary' },
        { id: 'job-optimized', name: 'ouraclaw-cli Morning Optimized' },
      ],
      existingLegacyJobs: [{ id: 'legacy-1', name: 'OuraClaw Morning Summary' }],
    });

    const { runScheduleStatus } = await import('../src/cli');
    runScheduleStatus();

    expect(printJson).toHaveBeenCalledWith({
      ok: true,
      openclawAvailable: true,
      configured: expect.objectContaining({
        deliveryLanguage: 'Slovak',
        channel: 'signal',
      }),
      managedJobs: {
        morning: {
          enabled: true,
          storedId: 'job-morning',
          exists: true,
        },
        evening: {
          enabled: false,
          storedId: null,
          exists: false,
        },
        optimizedWatcher: {
          enabled: true,
          deliveryMode: 'daily-when-ready',
          storedIds: ['job-optimized'],
          existingIds: ['job-optimized'],
        },
      },
      legacyJobs: [{ id: 'legacy-1', name: 'OuraClaw Morning Summary' }],
    });
  });

  test('disables managed schedule jobs without clearing other state', async () => {
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      schedule: {
        enabled: true,
        timezone: 'Europe/Bratislava',
        deliveryLanguage: 'English',
        channel: 'signal',
        target: '+421',
        morningEnabled: true,
        morningTime: '07:30',
        eveningEnabled: true,
        eveningTime: '21:00',
        optimizedWatcherEnabled: true,
        optimizedWatcherDeliveryMode: 'unusual-only',
        optimizedWatcherStart: '08:00',
        optimizedWatcherEnd: '13:00',
        optimizedWatcherIntervalMinutes: 60,
        morningCronJobId: 'morning-id',
        eveningCronJobId: 'evening-id',
        optimizedWatcherCronJobIds: ['opt-1', 'opt-2'],
      },
      deliveries: {},
    });
    removeManagedScheduleJobs.mockReturnValue({
      removedIds: ['morning-id', 'evening-id', 'opt-1', 'opt-2'],
    });

    const { runScheduleDisable } = await import('../src/cli');
    runScheduleDisable();

    expect(removeManagedScheduleJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        morningCronJobId: 'morning-id',
        eveningCronJobId: 'evening-id',
        optimizedWatcherCronJobIds: ['opt-1', 'opt-2'],
      })
    );
    expect(updateState).toHaveBeenCalledWith({
      schedule: expect.objectContaining({
        enabled: false,
        morningEnabled: false,
        eveningEnabled: false,
        optimizedWatcherEnabled: false,
        optimizedWatcherDeliveryMode: 'unusual-only',
        morningCronJobId: undefined,
        eveningCronJobId: undefined,
        optimizedWatcherCronJobIds: [],
        channel: 'signal',
      }),
    });
  });

  test('migrates legacy plugin cron jobs and imports defaults', async () => {
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      schedule: {
        enabled: false,
        timezone: 'UTC',
        deliveryLanguage: 'English',
        morningEnabled: false,
        morningTime: '07:00',
        eveningEnabled: false,
        eveningTime: '21:00',
        optimizedWatcherEnabled: false,
        optimizedWatcherDeliveryMode: 'unusual-only',
        optimizedWatcherStart: '08:00',
        optimizedWatcherEnd: '13:00',
        optimizedWatcherIntervalMinutes: 60,
      },
      deliveries: {},
    });
    listOpenClawCronJobs.mockReturnValue([{ id: 'legacy-1', name: 'OuraClaw Morning Summary' }]);
    inspectLegacySchedule.mockReturnValue({
      legacyConfigPath: '/tmp/legacy.json',
      legacyConfig: {
        preferredChannel: 'signal',
        preferredChannelTarget: '+421',
      },
      legacyDefaults: {
        channel: 'signal',
        target: '+421',
        timezone: 'Europe/Bratislava',
        morningEnabled: true,
        morningTime: '07:30',
      },
      legacyJobs: [{ id: 'legacy-1', name: 'OuraClaw Morning Summary' }],
    });
    removeLegacyOuraClawJobs.mockReturnValue({
      foundIds: ['legacy-1'],
      removedIds: ['legacy-1'],
    });

    const { runScheduleMigrateFromOuraClawPlugin } = await import('../src/cli');
    runScheduleMigrateFromOuraClawPlugin();

    expect(removeLegacyOuraClawJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredChannel: 'signal',
      }),
      [{ id: 'legacy-1', name: 'OuraClaw Morning Summary' }]
    );
    expect(updateState).toHaveBeenCalledWith({
      schedule: expect.objectContaining({
        channel: 'signal',
        target: '+421',
        timezone: 'Europe/Bratislava',
        morningEnabled: true,
        morningTime: '07:30',
      }),
    });
    expect(printJson).toHaveBeenCalledWith({
      ok: true,
      migrated: true,
      legacyConfigFound: true,
      legacyConfigPath: '/tmp/legacy.json',
      foundLegacyJobIds: ['legacy-1'],
      removedLegacyJobIds: ['legacy-1'],
      importedDefaults: {
        channel: 'signal',
        target: '+421',
        timezone: 'Europe/Bratislava',
        morningEnabled: true,
        morningTime: '07:30',
      },
      schedule: expect.objectContaining({
        channel: 'signal',
        target: '+421',
      }),
    });
  });
});
