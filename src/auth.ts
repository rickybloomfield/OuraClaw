import { refreshAccessToken } from './oauth';
import { readState, updateState } from './state-store';
import { OuraTokenResponse } from './types';

export function isTokenExpired(tokenExpiresAt?: number, now = Date.now()): boolean {
  if (!tokenExpiresAt) {
    return true;
  }
  return now > tokenExpiresAt - 5 * 60 * 1000;
}

export function tokenResponseToAuthPatch(response: OuraTokenResponse) {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    tokenExpiresAt: Date.now() + response.expires_in * 1000,
  };
}

export function getAuthStatus() {
  const state = readState();
  return {
    configured: Boolean(state.auth.clientId && state.auth.clientSecret),
    hasAccessToken: Boolean(state.auth.accessToken),
    hasRefreshToken: Boolean(state.auth.refreshToken),
    expired: isTokenExpired(state.auth.tokenExpiresAt),
    tokenExpiresAt: state.auth.tokenExpiresAt ?? null,
  };
}

export async function refreshStoredAuth(): Promise<ReturnType<typeof tokenResponseToAuthPatch>> {
  const state = readState();
  const { clientId, clientSecret, refreshToken } = state.auth;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Cannot refresh auth. Missing client credentials or refresh token.');
  }

  const response = await refreshAccessToken(clientId, clientSecret, refreshToken);
  const patch = tokenResponseToAuthPatch(response);
  updateState({ auth: patch });
  return patch;
}

export async function ensureValidAccessToken(): Promise<string> {
  const state = readState();
  if (state.auth.accessToken && !isTokenExpired(state.auth.tokenExpiresAt)) {
    return state.auth.accessToken;
  }

  if (!state.auth.refreshToken || !state.auth.clientId || !state.auth.clientSecret) {
    throw new Error('No valid access token is configured. Run `ouraclaw-cli setup` first.');
  }

  const patch = await refreshStoredAuth();
  if (!patch.accessToken) {
    throw new Error('Refresh completed without an access token.');
  }

  return patch.accessToken;
}
