import { execSync } from "child_process";
import { OuraConfig } from "./types";
import { updateConfig } from "./token-store";

function timeToCron(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${minutes} ${hours} * * *`;
}

function runOpenclaw(args: string): string {
  return execSync(`openclaw ${args}`, { encoding: "utf-8" }).trim();
}

export function createCronJobs(config: OuraConfig): void {
  const timezone = config.timezone || "UTC";
  const morningTime = config.morningTime || "07:00";
  const eveningTime = config.eveningTime || "21:00";

  // Remove existing jobs first
  removeCronJobs(config);

  // Build delivery args
  let deliverArgs = "";
  if (config.preferredChannel && config.preferredChannel !== "default") {
    deliverArgs = ` --deliver --channel ${config.preferredChannel}`;
    if (config.preferredChannelTarget) {
      deliverArgs += ` --to ${config.preferredChannelTarget}`;
    }
  } else {
    deliverArgs = " --deliver";
  }

  // Morning job
  const morningMsg = [
    "Fetch my Oura Ring data for this morning's summary.",
    "Use the oura_data tool to get daily_sleep, sleep (detailed periods), daily_readiness, daily_activity, and daily_stress for today.",
    "Also fetch yesterday's daily_activity as a fallback in case today's isn't ready yet.",
    "Format the results as a morning health summary using the oura skill's morning template.",
    "Remember: 8-10 lines max, include date, use emoji sparingly, warm but not cheesy, no app links.",
  ].join(" ");

  runOpenclaw(
    `cron add --name "ouraclaw-morning" --cron "${timeToCron(morningTime)}" --tz "${timezone}" --session isolated --message "${morningMsg}"${deliverArgs}`,
  );

  // Evening job
  const eveningMsg = [
    "Fetch my Oura Ring data for this evening's summary.",
    "Use the oura_data tool to get daily_activity, daily_readiness, daily_stress, and daily_sleep for today.",
    "Format the results as an evening health summary using the oura skill's evening template.",
    "Remember: 6-8 lines max, include date, focus on activity, mention last night's sleep as a recap, end with a warm wind-down nudge, no app links.",
  ].join(" ");

  runOpenclaw(
    `cron add --name "ouraclaw-evening" --cron "${timeToCron(eveningTime)}" --tz "${timezone}" --session isolated --message "${eveningMsg}"${deliverArgs}`,
  );

  updateConfig({
    morningCronJobId: "ouraclaw-morning",
    eveningCronJobId: "ouraclaw-evening",
  });
}

export function removeCronJobs(config: OuraConfig): void {
  if (config.morningCronJobId) {
    try {
      runOpenclaw(`cron remove --name "${config.morningCronJobId}"`);
    } catch {
      // Job may not exist yet
    }
  }
  if (config.eveningCronJobId) {
    try {
      runOpenclaw(`cron remove --name "${config.eveningCronJobId}"`);
    } catch {
      // Job may not exist yet
    }
  }
  updateConfig({
    morningCronJobId: undefined,
    eveningCronJobId: undefined,
  });
}
