import { OuraConfig, OuraTokenResponse } from "./types";
import { refreshAccessToken } from "./oauth";

export function saveTokens(
  config: OuraConfig,
  tokenResponse: OuraTokenResponse,
  updateConfig: (updates: Partial<OuraConfig>) => void,
): void {
  const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
  updateConfig({
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    tokenExpiresAt: expiresAt,
  });
}

export function isTokenExpired(config: OuraConfig): boolean {
  if (!config.tokenExpiresAt) return true;
  // Consider expired 5 minutes before actual expiry
  return Date.now() > config.tokenExpiresAt - 5 * 60 * 1000;
}

export function isTokenExpiringSoon(
  config: OuraConfig,
  withinMs: number = 48 * 60 * 60 * 1000,
): boolean {
  if (!config.tokenExpiresAt) return true;
  return Date.now() > config.tokenExpiresAt - withinMs;
}

export async function ensureValidToken(
  config: OuraConfig,
  updateConfig: (updates: Partial<OuraConfig>) => void,
): Promise<string> {
  if (!config.accessToken) {
    throw new Error(
      "No access token configured. Run `openclaw ouraclaw setup` to authenticate.",
    );
  }

  if (!isTokenExpired(config)) {
    return config.accessToken;
  }

  if (!config.refreshToken || !config.clientId || !config.clientSecret) {
    throw new Error(
      "Token expired and cannot refresh — missing credentials. Run `openclaw ouraclaw setup` again.",
    );
  }

  const tokenResponse = await refreshAccessToken(
    config.clientId,
    config.clientSecret,
    config.refreshToken,
  );

  // Oura refresh tokens are single-use, so save the new one immediately
  saveTokens(config, tokenResponse, updateConfig);

  return tokenResponse.access_token;
}
