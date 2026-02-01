import { execFileSync } from "child_process";
import { OuraConfig } from "./types";
import { updateConfig } from "./token-store";

function timeToCron(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${minutes} ${hours} * * *`;
}

function runOpenclaw(args: string[]): string {
  return execFileSync("openclaw", args, { encoding: "utf-8" }).trim();
}

function findJobIdByName(name: string): string | null {
  try {
    const output = runOpenclaw(["cron", "list", "--json"]);
    const data = JSON.parse(output);
    const jobs: any[] = Array.isArray(data) ? data : data?.jobs || [];
    const job = jobs.find((j: any) => j.name === name);
    return job?.id || null;
  } catch {
    return null;
  }
}

export function createCronJobs(config: OuraConfig): void {
  const timezone = config.timezone || "UTC";
  const morningTime = config.morningTime || "07:00";
  const eveningTime = config.eveningTime || "21:00";

  // Remove existing jobs first
  removeCronJobs(config);

  // Morning job
  const morningMsg = [
    "Fetch my Oura Ring data for this morning's summary.",
    "Use the oura_data tool to get daily_sleep, sleep (detailed periods), daily_readiness, daily_activity, and daily_stress for today.",
    "Also fetch yesterday's daily_activity as a fallback in case today's isn't ready yet.",
    "Format the results as a morning health summary using the oura skill's morning template.",
    "Remember: 8-10 lines max, include date, use emoji sparingly, warm but not cheesy, no app links.",
  ].join(" ");

  const morningArgs = [
    "cron", "add",
    "--name", "OuraClaw Morning Summary",
    "--cron", timeToCron(morningTime),
    "--tz", timezone,
    "--session", "isolated",
    "--message", morningMsg,
    "--deliver",
  ];

  if (config.preferredChannel && config.preferredChannel !== "default") {
    morningArgs.push("--channel", config.preferredChannel);
    if (config.preferredChannelTarget) {
      morningArgs.push("--to", config.preferredChannelTarget);
    }
  }

  runOpenclaw(morningArgs);

  // Evening job
  const eveningMsg = [
    "Fetch my Oura Ring data for this evening's summary.",
    "Use the oura_data tool to get daily_activity, daily_readiness, daily_stress, and daily_sleep for today.",
    "Format the results as an evening health summary using the oura skill's evening template.",
    "Remember: 6-8 lines max, include date, focus on activity, mention last night's sleep as a recap, end with a warm wind-down nudge, no app links.",
  ].join(" ");

  const eveningArgs = [
    "cron", "add",
    "--name", "OuraClaw Evening Summary",
    "--cron", timeToCron(eveningTime),
    "--tz", timezone,
    "--session", "isolated",
    "--message", eveningMsg,
    "--deliver",
  ];

  if (config.preferredChannel && config.preferredChannel !== "default") {
    eveningArgs.push("--channel", config.preferredChannel);
    if (config.preferredChannelTarget) {
      eveningArgs.push("--to", config.preferredChannelTarget);
    }
  }

  runOpenclaw(eveningArgs);

  // Look up the UUIDs that were just assigned
  const morningId = findJobIdByName("OuraClaw Morning Summary");
  const eveningId = findJobIdByName("OuraClaw Evening Summary");

  updateConfig({
    morningCronJobId: morningId || undefined,
    eveningCronJobId: eveningId || undefined,
  });
}

export function removeCronJobs(config: OuraConfig): void {
  // Try removing by stored UUID first
  if (config.morningCronJobId) {
    try {
      runOpenclaw(["cron", "remove", config.morningCronJobId]);
    } catch {
      // Job may not exist
    }
  }
  if (config.eveningCronJobId) {
    try {
      runOpenclaw(["cron", "remove", config.eveningCronJobId]);
    } catch {
      // Job may not exist
    }
  }

  // Also try by name in case UUIDs weren't stored (e.g., upgrade from older version)
  for (const name of ["OuraClaw Morning Summary", "OuraClaw Evening Summary", "ouraclaw-morning", "ouraclaw-evening"]) {
    const id = findJobIdByName(name);
    if (id && id !== config.morningCronJobId && id !== config.eveningCronJobId) {
      try {
        runOpenclaw(["cron", "remove", id]);
      } catch {
        // Job may not exist
      }
    }
  }

  updateConfig({
    morningCronJobId: undefined,
    eveningCronJobId: undefined,
  });
}
