import fs from "fs";
import path from "path";
import os from "os";
import { OuraConfig, OuraTokenResponse } from "./types";
import { refreshAccessToken } from "./oauth";

const CONFIG_DIR = path.join(os.homedir(), ".openclaw", "plugins", "ouraclaw");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function readConfig(): OuraConfig {
  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function writeConfig(config: OuraConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function updateConfig(updates: Partial<OuraConfig>): void {
  const config = readConfig();
  Object.assign(config, updates);
  writeConfig(config);
}

export function saveTokens(tokenResponse: OuraTokenResponse): void {
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

export async function ensureValidToken(): Promise<string> {
  const config = readConfig();

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
  saveTokens(tokenResponse);

  return tokenResponse.access_token;
}
