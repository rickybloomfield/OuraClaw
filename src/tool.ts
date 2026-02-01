import { fetchOuraData } from "./oura-client";
import { ensureValidToken } from "./token-store";
import { OuraEndpoint, OURA_ENDPOINTS } from "./types";

export function defineOuraDataTool() {
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
    execute: async (
      _id: string,
      params: { endpoint: OuraEndpoint; start_date?: string; end_date?: string },
    ) => {
      const accessToken = await ensureValidToken();

      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86_400_000)
        .toISOString()
        .split("T")[0];

      const startDate = params.start_date || today;
      const endDate = params.end_date || tomorrow;

      const result = await fetchOuraData(
        accessToken,
        params.endpoint,
        startDate,
        endDate,
      );

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
