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
const evaluateMorning = vi.fn();
const buildEveningSummary = vi.fn();
const createOrReplaceScheduleJobs = vi.fn();
const getConfiguredChannelTargets = vi.fn(() => []);
const getLegacyScheduleDefaults = vi.fn(() => undefined);
const getScheduleStatus = vi.fn();
const isOpenClawAvailable = vi.fn(() => false);
const isValidTimeOfDay = vi.fn(() => true);
const isValidTimezone = vi.fn(() => true);
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

vi.mock('../src/morning', () => ({
  evaluateMorning,
}));

vi.mock('../src/schedule', () => ({
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
}));

vi.mock('../src/summaries', () => ({
  buildEveningSummary,
  selectPreferredSleepRecord: vi.fn((records) => records[0]),
}));

describe('cli actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createOrReplaceScheduleJobs.mockImplementation((schedule) => schedule);
    getConfiguredChannelTargets.mockReturnValue([]);
    getLegacyScheduleDefaults.mockReturnValue(undefined);
    inspectLegacySchedule.mockReturnValue({
      legacyConfigPath: '/tmp/legacy.json',
      legacyConfig: undefined,
      legacyDefaults: undefined,
      legacyJobs: [],
    });
    isOpenClawAvailable.mockReturnValue(false);
    isValidTimeOfDay.mockReturnValue(true);
    isValidTimezone.mockReturnValue(true);
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

  test('defaults week overview to the last seven completed days', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-04-20T11:00:00.000Z'));

      const { resolveWeekOverviewDateRange } = await import('../src/cli');

      expect(resolveWeekOverviewDateRange(undefined, undefined)).toEqual({
        start: '2026-04-13',
        end: '2026-04-19',
        mode: 'last-7-days',
        days: [
          '2026-04-13',
          '2026-04-14',
          '2026-04-15',
          '2026-04-16',
          '2026-04-17',
          '2026-04-18',
          '2026-04-19',
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('resolves explicit week overview date ranges as seven inclusive days', async () => {
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

  test('shifts week overview records back to completed calendar days', async () => {
    fetchOuraData
      .mockResolvedValueOnce({ data: [{ day: '2026-04-14', score: 81 }] })
      .mockResolvedValueOnce({
        data: [{ day: '2026-04-14', score: 84, temperature_deviation: 0.2 }],
      })
      .mockResolvedValueOnce({
        data: [
          {
            day: '2026-04-13',
            type: 'long_sleep',
            average_hrv: 20,
            lowest_heart_rate: 62,
            total_sleep_duration: 26000,
          },
          {
            day: '2026-04-14',
            type: 'long_sleep',
            average_hrv: 21,
            lowest_heart_rate: 61,
            total_sleep_duration: 28000,
          },
        ],
      });

    const { fetchWeekOverviewRecordsForRange } = await import('../src/cli');
    const records = await fetchWeekOverviewRecordsForRange('token', '2026-04-13', '2026-04-19');

    expect(fetchOuraData).toHaveBeenNthCalledWith(3, 'token', 'sleep', '2026-04-13', '2026-04-20');
    expect(records).toEqual([
      {
        day: '2026-04-13',
        sleepScore: 81,
        readinessScore: 84,
        temperatureDeviation: 0.2,
        averageHrv: 21,
        lowestHeartRate: 61,
        totalSleepDuration: 28000,
      },
    ]);
  });

  test('prints compact week overview text when requested', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    isBaselineStale.mockReturnValue(false);
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      baseline: {
        updatedAt: '2026-04-10T00:00:00.000Z',
        mode: 'calendar-weeks',
        sourceStartDay: '2026-03-16',
        sourceEndDay: '2026-04-05',
        weeks: ['2026-W12'],
        metrics: {},
      },
      schedule: { timezone: 'Europe/Bratislava' },
      deliveries: {},
    });
    fetchOuraData
      .mockResolvedValueOnce({ data: [{ day: '2026-04-14', score: 81 }] })
      .mockResolvedValueOnce({
        data: [{ day: '2026-04-14', score: 84, temperature_deviation: 0.2 }],
      })
      .mockResolvedValueOnce({
        data: [
          {
            day: '2026-04-13',
            type: 'long_sleep',
            average_hrv: 20,
            lowest_heart_rate: 62,
            total_sleep_duration: 26000,
          },
          {
            day: '2026-04-14',
            type: 'long_sleep',
            average_hrv: 21,
            lowest_heart_rate: 61,
            total_sleep_duration: 28000,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'activity-1',
            day: '2026-04-13',
            score: 79,
            timestamp: '',
            active_calories: 410,
            total_calories: 2340,
            steps: 9200,
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'stress-1',
            day: '2026-04-13',
            stress_high: 35,
            recovery_high: 5,
            day_summary: 'stressful',
          },
        ],
      });
    evaluateMorning
      .mockReturnValueOnce({
        dataReady: true,
        shouldAlert: true,
        metricSignals: [
          { metric: 'sleepScore', value: 81, attention: false },
          { metric: 'readinessScore', value: 84, attention: false },
          { metric: 'totalSleepDuration', value: 28000, attention: false },
          { metric: 'temperatureDeviation', value: 0.2, attention: true },
          { metric: 'lowestHeartRate', value: 61, attention: false },
          { metric: 'averageHrv', value: 21, attention: false },
        ],
      })
      .mockReturnValue({
        dataReady: false,
        shouldAlert: false,
        metricSignals: [],
      });

    const { runWeekOverview } = await import('../src/cli');
    await runWeekOverview(true, '2026-04-13', '2026-04-19');

    expect(printText).toHaveBeenCalledWith(
      [
        'Your Oura overview for Apr 13 - Apr 19.',
        '',
        'Mon: Sleep 81 | Readiness 84 | Total 7h 47m | ⚠️ Temp +0.2C | Lowest HR 61 bpm | HRV 21 ms | Steps 9.2k | Stress stressful',
        'Tue: data not ready',
        'Wed: data not ready',
        'Thu: data not ready',
        'Fri: data not ready',
        'Sat: data not ready',
        'Sun: data not ready',
        '',
        'Main pattern: temperature was the most repeated attention signal this week.',
      ].join('\n')
    );
  });

  test('prints morning summary text when requested', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    fetchOuraData.mockResolvedValue({ data: [] });
    evaluateMorning.mockReturnValue({
      dataReady: true,
      shouldAlert: false,
      shouldSend: true,
      deliveryMode: 'daily-when-ready',
      message: 'morning text',
      alertReasons: [],
      skipReasons: [],
    });

    const { runMorningSummary } = await import('../src/cli');
    await runMorningSummary(true, 'daily-when-ready');

    expect(printText).toHaveBeenCalledWith('morning text');
  });

  test('refreshes stale baseline during canonical morning flow', async () => {
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
    evaluateMorning.mockReturnValue({
      shouldSend: false,
      shouldAlert: false,
      dataReady: true,
      alertReasons: [],
      skipReasons: [],
    });

    const { runMorningSummaryJson } = await import('../src/cli');
    await runMorningSummaryJson();

    expect(rebuildAutomaticBaseline).toHaveBeenCalled();
    expect(evaluateMorning).toHaveBeenCalled();
    expect(printJson).toHaveBeenCalledWith({
      shouldSend: false,
      shouldAlert: false,
      dataReady: true,
      alertReasons: [],
      skipReasons: [],
    });
  });

  test('records confirmed morning delivery', async () => {
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
    evaluateMorning.mockReturnValue({
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

    const { confirmMorningDelivery } = await import('../src/cli');
    await confirmMorningDelivery('abc123');

    expect(updateState).toHaveBeenCalledWith({
      deliveries: {
        morning: {
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
      morningDeliveryMode: 'daily-when-ready',
      morningStart: '08:00',
      morningEnd: '13:00',
      morningIntervalMinutes: 60,
      morningCronJobIds: ['job-morning-1', 'job-morning-2'],
      eveningEnabled: false,
      eveningTime: '21:00',
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
        { id: 'job-morning-1', name: 'ouraclaw-cli Morning Summary #1' },
        { id: 'job-morning-2', name: 'ouraclaw-cli Morning Summary #2' },
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
          deliveryMode: 'daily-when-ready',
          storedIds: ['job-morning-1', 'job-morning-2'],
          existingIds: ['job-morning-1', 'job-morning-2'],
        },
        evening: {
          enabled: false,
          storedId: null,
          exists: false,
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
        morningDeliveryMode: 'unusual-only',
        morningStart: '08:00',
        morningEnd: '13:00',
        morningIntervalMinutes: 60,
        morningCronJobIds: ['morning-1', 'morning-2'],
        eveningEnabled: true,
        eveningTime: '21:00',
        eveningCronJobId: 'evening-id',
      },
      deliveries: {},
    });
    removeManagedScheduleJobs.mockReturnValue({
      removedIds: ['morning-1', 'morning-2', 'evening-id'],
    });

    const { runScheduleDisable } = await import('../src/cli');
    runScheduleDisable();

    expect(removeManagedScheduleJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        morningCronJobIds: ['morning-1', 'morning-2'],
        eveningCronJobId: 'evening-id',
      })
    );
    expect(updateState).toHaveBeenCalledWith({
      schedule: expect.objectContaining({
        enabled: false,
        morningEnabled: false,
        eveningEnabled: false,
        morningDeliveryMode: 'unusual-only',
        morningCronJobIds: [],
        eveningCronJobId: undefined,
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
        morningDeliveryMode: 'unusual-only',
        morningStart: '08:00',
        morningEnd: '13:00',
        morningIntervalMinutes: 60,
        eveningEnabled: false,
        eveningTime: '21:00',
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
        morningStart: '07:30',
        morningEnd: '07:30',
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
        morningStart: '07:30',
        morningEnd: '07:30',
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
        morningStart: '07:30',
        morningEnd: '07:30',
      },
      schedule: expect.objectContaining({
        channel: 'signal',
        target: '+421',
      }),
    });
  });

  test('schedule setup lets a known discord channel use a custom target id', async () => {
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, supportingMetricAlertCount: 2 },
      schedule: {
        enabled: true,
        timezone: 'Europe/Vienna',
        deliveryLanguage: 'Slovak',
        channel: 'discord',
        target: '809342603711348768',
        morningEnabled: true,
        morningDeliveryMode: 'unusual-only',
        morningStart: '08:00',
        morningEnd: '13:00',
        morningIntervalMinutes: 60,
        eveningEnabled: false,
        eveningTime: '21:00',
      },
      deliveries: {},
    });
    isOpenClawAvailable.mockReturnValue(true);
    getConfiguredChannelTargets.mockReturnValue([
      { label: 'whatsapp -> +421944249199', channel: 'whatsapp', target: '+421944249199' },
      { label: 'discord -> 809342603711348768', channel: 'discord', target: '809342603711348768' },
    ]);
    readlineQuestion
      .mockResolvedValueOnce('2')
      .mockResolvedValueOnce('2')
      .mockResolvedValueOnce('1482716547729326262')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    const { runScheduleSetup } = await import('../src/cli');
    await runScheduleSetup();

    expect(createOrReplaceScheduleJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'discord',
        target: '1482716547729326262',
        deliveryLanguage: 'Slovak',
        timezone: 'Europe/Vienna',
      })
    );
    expect(printText).toHaveBeenCalledWith('Choose the delivery channel for scheduled messages:');
    expect(printText).toHaveBeenCalledWith(
      'Choose the delivery target for scheduled messages on discord:'
    );
  });
});
