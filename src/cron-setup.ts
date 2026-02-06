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
  const morningMsg = "Deliver my Oura Ring morning health summary following the oura skill's Morning Summary Template.";

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
  const eveningMsg = "Deliver my Oura Ring evening health summary following the oura skill's Evening Summary Template.";

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
