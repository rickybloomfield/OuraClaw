import { OuraConfig } from "./types";

interface CronJobSpec {
  id: string;
  cron: string;
  timezone: string;
  type: "agentTurn";
  isolatedSession: boolean;
  message: string;
  deliver: boolean;
  channel?: string;
  channelTarget?: string;
}

function timeToCron(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${minutes} ${hours} * * *`;
}

export function buildMorningJob(config: OuraConfig): CronJobSpec {
  const time = config.morningTime || "07:00";
  const timezone = config.timezone || "UTC";

  const job: CronJobSpec = {
    id: "ouraclaw-morning",
    cron: timeToCron(time),
    timezone,
    type: "agentTurn",
    isolatedSession: true,
    deliver: true,
    message: [
      "Fetch my Oura Ring data for this morning's summary.",
      "Use the oura_data tool to get daily_sleep, daily_readiness, and daily_stress for today.",
      "Also fetch the detailed sleep periods using the sleep endpoint.",
      "Format the results as a morning health summary using the oura skill's morning template.",
    ].join(" "),
  };

  if (config.preferredChannel && config.preferredChannel !== "default") {
    job.channel = config.preferredChannel;
    if (config.preferredChannelTarget) {
      job.channelTarget = config.preferredChannelTarget;
    }
  }

  return job;
}

export function buildEveningJob(config: OuraConfig): CronJobSpec {
  const time = config.eveningTime || "21:00";
  const timezone = config.timezone || "UTC";

  const job: CronJobSpec = {
    id: "ouraclaw-evening",
    cron: timeToCron(time),
    timezone,
    type: "agentTurn",
    isolatedSession: true,
    deliver: true,
    message: [
      "Fetch my Oura Ring data for this evening's summary.",
      "Use the oura_data tool to get daily_activity, daily_readiness, and daily_stress for today.",
      "Also fetch daily_sleep for a sleep recap.",
      "Format the results as an evening health summary using the oura skill's evening template.",
    ].join(" "),
  };

  if (config.preferredChannel && config.preferredChannel !== "default") {
    job.channel = config.preferredChannel;
    if (config.preferredChannelTarget) {
      job.channelTarget = config.preferredChannelTarget;
    }
  }

  return job;
}

export function createCronJobs(
  config: OuraConfig,
  updateConfig: (updates: Partial<OuraConfig>) => void,
  registerCronJob: (job: CronJobSpec) => void,
): void {
  const morningJob = buildMorningJob(config);
  const eveningJob = buildEveningJob(config);

  registerCronJob(morningJob);
  registerCronJob(eveningJob);

  updateConfig({
    morningCronJobId: morningJob.id,
    eveningCronJobId: eveningJob.id,
  });
}

export function removeCronJobs(
  config: OuraConfig,
  updateConfig: (updates: Partial<OuraConfig>) => void,
  unregisterCronJob: (id: string) => void,
): void {
  if (config.morningCronJobId) {
    unregisterCronJob(config.morningCronJobId);
  }
  if (config.eveningCronJobId) {
    unregisterCronJob(config.eveningCronJobId);
  }
  updateConfig({
    morningCronJobId: undefined,
    eveningCronJobId: undefined,
  });
}
