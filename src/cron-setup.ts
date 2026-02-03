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

function listAllJobs(): any[] {
  try {
    const output = runOpenclaw(["cron", "list", "--json"]);
    const data = JSON.parse(output);
    return Array.isArray(data) ? data : data?.jobs || [];
  } catch {
    return [];
  }
}

const OURACLAW_JOB_NAMES = [
  "OuraClaw Morning Summary",
  "OuraClaw Evening Summary",
  "ouraclaw-morning",
  "ouraclaw-evening",
];

export function createCronJobs(config: OuraConfig): void {
  const timezone = config.timezone || "UTC";
  const morningTime = config.morningTime || "07:00";
  const eveningTime = config.eveningTime || "21:00";

  // Single list call to find all jobs to remove
  const existingJobs = listAllJobs();
  const idsToRemove = new Set<string>();

  // By stored UUID
  if (config.morningCronJobId) idsToRemove.add(config.morningCronJobId);
  if (config.eveningCronJobId) idsToRemove.add(config.eveningCronJobId);

  // By name (handles upgrades from older naming or missing UUIDs)
  for (const job of existingJobs) {
    if (OURACLAW_JOB_NAMES.includes(job.name)) {
      idsToRemove.add(job.id);
    }
  }

  for (const id of idsToRemove) {
    try {
      runOpenclaw(["cron", "remove", id]);
    } catch {
      // Job may already be gone
    }
  }

  // Create morning job
  const morningMsg = [
    "Fetch my Oura Ring data for this morning's summary.",
    "Use the oura_data tool to get daily_sleep, sleep (detailed periods), daily_readiness, daily_activity, and daily_stress for today.",
    "Also fetch yesterday's daily_activity as a fallback in case today's isn't ready yet.",
    "Format the results as a morning health summary using the oura skill's morning template.",
    "Remember: 8-10 lines max, include date, use emoji sparingly, warm but not cheesy.",
    "Do not send any preamble or intro message before the summary — just send the summary directly as a single message.",
    "End the summary with a line like: \"Dive deeper in the Oura app: https://cloud.ouraring.com/app/v1/home — enjoy your day!\"",
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

  // Create evening job
  const eveningMsg = [
    "Fetch my Oura Ring data for this evening's summary.",
    "Use the oura_data tool to get daily_activity, daily_readiness, daily_stress, and daily_sleep for today.",
    "Format the results as an evening health summary using the oura skill's evening template.",
    "Remember: 6-8 lines max, include date, focus on activity, mention last night's sleep as a recap, end with a warm wind-down nudge.",
    "Do not send any preamble or intro message before the summary — just send the summary directly as a single message.",
    "End the summary with a line like: \"Dive deeper in the Oura app: https://cloud.ouraring.com/app/v1/home — sleep well!\"",
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

  // Single list call to look up both new UUIDs
  const newJobs = listAllJobs();
  const morningJob = newJobs.find((j: any) => j.name === "OuraClaw Morning Summary");
  const eveningJob = newJobs.find((j: any) => j.name === "OuraClaw Evening Summary");

  updateConfig({
    morningCronJobId: morningJob?.id || undefined,
    eveningCronJobId: eveningJob?.id || undefined,
  });
}

export function removeCronJobs(config: OuraConfig): void {
  const existingJobs = listAllJobs();
  const idsToRemove = new Set<string>();

  if (config.morningCronJobId) idsToRemove.add(config.morningCronJobId);
  if (config.eveningCronJobId) idsToRemove.add(config.eveningCronJobId);

  for (const job of existingJobs) {
    if (OURACLAW_JOB_NAMES.includes(job.name)) {
      idsToRemove.add(job.id);
    }
  }

  for (const id of idsToRemove) {
    try {
      runOpenclaw(["cron", "remove", id]);
    } catch {
      // Job may already be gone
    }
  }

  updateConfig({
    morningCronJobId: undefined,
    eveningCronJobId: undefined,
  });
}
