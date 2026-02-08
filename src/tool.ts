import { fetchOuraData } from "./oura-client";
import { ensureValidToken } from "./token-store";
import { OuraEndpoint, OURA_ENDPOINTS } from "./types";

export function defineOuraDataTool() {
  return {
    name: "oura_data",
    description:
      "Fetch health data from the user's Oura Ring. Returns raw JSON. Supports all Oura API v2 endpoints: sleep, readiness, activity, stress, heart rate, SpO2, workouts, sessions, tags, cardiovascular age, resilience, VO2 max, rest mode, sleep time, ring config, and personal info.",
    parameters: {
      type: "object" as const,
      properties: {
        endpoint: {
          type: "string" as const,
          enum: OURA_ENDPOINTS,
          description:
            "Data category to fetch. Common: daily_sleep, daily_readiness, daily_activity, sleep, daily_stress. Also: heartrate, daily_spo2, workout, session, enhanced_tag, daily_cardiovascular_age, daily_resilience, vO2_max, rest_mode_period, sleep_time, ring_configuration, personal_info, tag",
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

      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      const tomorrow = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, "0")}-${String(tom.getDate()).padStart(2, "0")}`;

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
