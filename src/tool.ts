import { fetchOuraData } from "./oura-client";
import { ensureValidToken } from "./token-store";
import { OuraConfig, OuraEndpoint, OURA_ENDPOINTS } from "./types";

export interface OuraToolInput {
  endpoint: OuraEndpoint;
  start_date?: string;
  end_date?: string;
}

export function defineOuraDataTool(
  getConfig: () => OuraConfig,
  updateConfig: (updates: Partial<OuraConfig>) => void,
) {
  return {
    name: "oura_data",
    description:
      "Fetch health data from the user's Oura Ring. Returns raw JSON for sleep, readiness, activity, detailed sleep periods, or stress data.",
    parameters: {
      type: "object" as const,
      properties: {
        endpoint: {
          type: "string" as const,
          enum: OURA_ENDPOINTS,
          description:
            "Data category to fetch: daily_sleep, daily_readiness, daily_activity, sleep (detailed periods), or daily_stress",
        },
        start_date: {
          type: "string" as const,
          description:
            "Start date in YYYY-MM-DD format. Defaults to today if omitted.",
        },
        end_date: {
          type: "string" as const,
          description:
            "End date in YYYY-MM-DD format. Defaults to tomorrow (to include today) if omitted.",
        },
      },
      required: ["endpoint"],
    },
    handler: async (input: OuraToolInput) => {
      const config = getConfig();
      const accessToken = await ensureValidToken(config, updateConfig);

      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86_400_000)
        .toISOString()
        .split("T")[0];

      const startDate = input.start_date || today;
      const endDate = input.end_date || tomorrow;

      const result = await fetchOuraData(
        accessToken,
        input.endpoint,
        startDate,
        endDate,
      );

      return JSON.stringify(result, null, 2);
    },
  };
}
