import { beforeEach, describe, expect, test, vi } from 'vitest';

const printJson = vi.fn();
const printText = vi.fn();
const ensureValidAccessToken = vi.fn();
const fetchOuraData = vi.fn();
const readState = vi.fn();
const updateState = vi.fn();
const rebuildAutomaticBaseline = vi.fn();
const rebuildManualBaseline = vi.fn();
const isBaselineStale = vi.fn();
const evaluateMorningOptimized = vi.fn();
const buildMorningSummary = vi.fn();
const buildEveningSummary = vi.fn();

vi.mock('../src/output', () => ({
  printJson,
  printText,
}));

vi.mock('../src/auth', () => ({
  ensureValidAccessToken,
  getAuthStatus: vi.fn(),
  refreshStoredAuth: vi.fn(),
  tokenResponseToAuthPatch: vi.fn(),
}));

vi.mock('../src/oura-client', () => ({
  fetchOuraData,
}));

vi.mock('../src/state-store', () => ({
  defaultState: vi.fn(),
  readState,
  updateState,
  writeState: vi.fn(),
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
}));

vi.mock('../src/morning-optimized', () => ({
  evaluateMorningOptimized,
}));

vi.mock('../src/summaries', () => ({
  buildMorningSummary,
  buildEveningSummary,
  selectPreferredSleepRecord: vi.fn((records) => records[0]),
}));

describe('cli actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  test('runs fetch and prints raw json', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    fetchOuraData.mockResolvedValue({ data: [{ id: 'sleep' }] });

    const { runFetch } = await import('../src/cli');
    await runFetch('daily_sleep', '2026-03-13', '2026-03-13');

    expect(fetchOuraData).toHaveBeenCalledWith('token', 'daily_sleep', '2026-03-13', '2026-03-13');
    expect(printJson).toHaveBeenCalledWith({ data: [{ id: 'sleep' }] });
  });

  test('rebuilds manual baseline and prints it', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, breachMetricCount: 1 },
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
      baselineConfig: { lowerPercentile: 25, breachMetricCount: 1 },
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
      baselineConfig: { lowerPercentile: 25, breachMetricCount: 1 },
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
      ordinary: true,
      dataReady: true,
      reasons: [],
    });

    const { runMorningOptimized } = await import('../src/cli');
    await runMorningOptimized();

    expect(rebuildAutomaticBaseline).toHaveBeenCalled();
    expect(evaluateMorningOptimized).toHaveBeenCalled();
    expect(printJson).toHaveBeenCalledWith({
      shouldSend: false,
      ordinary: true,
      dataReady: true,
      reasons: [],
    });
  });

  test('records confirmed morning optimized delivery', async () => {
    ensureValidAccessToken.mockResolvedValue('token');
    fetchOuraData.mockResolvedValue({ data: [] });
    readState.mockReturnValue({
      schemaVersion: 1,
      auth: {},
      thresholds: { sleepScoreMin: 75, readinessScoreMin: 75, temperatureDeviationMax: 0.1 },
      baselineConfig: { lowerPercentile: 25, breachMetricCount: 1 },
      baseline: undefined,
      deliveries: {},
    });
    isBaselineStale.mockReturnValue(false);
    evaluateMorningOptimized.mockReturnValue({
      shouldSend: true,
      ordinary: false,
      dataReady: true,
      reasons: ['sleep_below_threshold'],
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
});
