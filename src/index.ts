import { defineOuraDataTool } from "./tool";
import { registerCli } from "./cli";
import { isTokenExpiringSoon } from "./token-store";
import { refreshAccessToken } from "./oauth";
import { saveTokens } from "./token-store";
import { OuraConfig } from "./types";

export default function ouraclaw(api: any) {
  const getConfig = (): OuraConfig => api.getPluginConfig("ouraclaw") || {};
  const updateConfig = (updates: Partial<OuraConfig>) =>
    api.updatePluginConfig("ouraclaw", updates);

  // Register the oura_data agent tool
  const tool = defineOuraDataTool(getConfig, updateConfig);
  api.registerTool(tool);

  // Register CLI commands
  const cli = registerCli({
    getConfig,
    updateConfig,
    prompt: api.prompt,
    select: api.select,
    confirm: api.confirm,
    log: api.log,
    openUrl: api.openUrl,
    registerCronJob: api.registerCronJob,
    unregisterCronJob: api.unregisterCronJob,
  });
  api.registerCommand(cli);

  // Register background service for proactive token refresh
  api.registerBackgroundService({
    id: "ouraclaw-token-refresh",
    description: "Proactively refreshes Oura API tokens before they expire",
    intervalMs: 12 * 60 * 60 * 1000, // Every 12 hours
    handler: async () => {
      const config = getConfig();

      if (
        !config.accessToken ||
        !config.refreshToken ||
        !config.clientId ||
        !config.clientSecret
      ) {
        return; // Not configured yet
      }

      if (isTokenExpiringSoon(config)) {
        try {
          const tokenResponse = await refreshAccessToken(
            config.clientId,
            config.clientSecret,
            config.refreshToken,
          );
          saveTokens(config, tokenResponse, updateConfig);
        } catch (err: any) {
          api.log(
            `[ouraclaw] Token refresh failed: ${err.message}. Token may need manual refresh via setup.`,
          );
        }
      }
    },
  });
}
