import { describe, expect, test, vi } from 'vitest';

vi.mock('../src/state-store', () => ({
  readState: vi.fn(),
  updateState: vi.fn(),
}));

vi.mock('../src/oauth', () => ({
  refreshAccessToken: vi.fn(),
}));

import {
  ensureValidAccessToken,
  getAuthStatus,
  isTokenExpired,
  refreshStoredAuth,
} from '../src/auth';
import { refreshAccessToken } from '../src/oauth';
import { readState, updateState } from '../src/state-store';

describe('auth', () => {
  test('reports auth status', () => {
    vi.mocked(readState).mockReturnValue({
      schemaVersion: 1,
      auth: {
        clientId: 'id',
        clientSecret: 'secret',
        accessToken: 'access',
        refreshToken: 'refresh',
        tokenExpiresAt: Date.now() + 600_000,
      },
      thresholds: {
        sleepScoreMin: 75,
        readinessScoreMin: 75,
        temperatureDeviationMax: 0.1,
      },
    });

    expect(getAuthStatus()).toMatchObject({
      configured: true,
      hasAccessToken: true,
      hasRefreshToken: true,
      expired: false,
    });
  });

  test('detects expired tokens', () => {
    expect(isTokenExpired(Date.now() - 1)).toBe(true);
  });

  test('refreshes stored auth and updates state', async () => {
    vi.mocked(readState).mockReturnValue({
      schemaVersion: 1,
      auth: {
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'refresh',
      },
      thresholds: {
        sleepScoreMin: 75,
        readinessScoreMin: 75,
        temperatureDeviationMax: 0.1,
      },
    });
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    const patch = await refreshStoredAuth();

    expect(patch.accessToken).toBe('new-access');
    expect(updateState).toHaveBeenCalled();
  });

  test('returns current access token when still valid', async () => {
    vi.mocked(readState).mockReturnValue({
      schemaVersion: 1,
      auth: {
        accessToken: 'still-good',
        tokenExpiresAt: Date.now() + 3600_000,
      },
      thresholds: {
        sleepScoreMin: 75,
        readinessScoreMin: 75,
        temperatureDeviationMax: 0.1,
      },
    });

    await expect(ensureValidAccessToken()).resolves.toBe('still-good');
  });

  test('refreshes expired access tokens', async () => {
    vi.mocked(readState).mockReturnValue({
      schemaVersion: 1,
      auth: {
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'refresh',
        accessToken: 'expired',
        tokenExpiresAt: Date.now() - 1,
      },
      thresholds: {
        sleepScoreMin: 75,
        readinessScoreMin: 75,
        temperatureDeviationMax: 0.1,
      },
    });
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    await expect(ensureValidAccessToken()).resolves.toBe('fresh-access');
  });

  test('throws when refresh is impossible', async () => {
    vi.mocked(readState).mockReturnValue({
      schemaVersion: 1,
      auth: {
        accessToken: undefined,
      },
      thresholds: {
        sleepScoreMin: 75,
        readinessScoreMin: 75,
        temperatureDeviationMax: 0.1,
      },
    });

    await expect(ensureValidAccessToken()).rejects.toThrow('No valid access token');
  });
});
