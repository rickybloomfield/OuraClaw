import { execSync } from "child_process";
import path from "path";
import { OuraConfig } from "./types";
import { updateConfig } from "./token-store";

function timeToCron(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${minutes} ${hours} * * *`;
}

/**
 * Run an openclaw CLI command. Uses execSync with shell so that platform
 * command shims (.cmd on Windows) are resolved automatically. Each argument
 * is individually quoted to protect spaces and special characters.
 */
export function runOpenclaw(args: string[]): string {
  const quoted = args.map((a) => `"${a.replace(/"/g, '\\"')}"`);
  const cmd = `openclaw ${quoted.join(" ")}`;
  return execSync(cmd, { encoding: "utf-8" }).trim();
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

  // Create morning & evening jobs
  const channel = config.preferredChannel && config.preferredChannel !== "default"
    ? config.preferredChannel
    : "";
  const target = config.preferredChannelTarget || "";
  const skillPath = path.resolve(__dirname, "..", "skills", "oura", "SKILL.md");

  // When a specific channel is configured, disable announce mode (which
  // summarises the output) and instruct the agent to send the message
  // directly via its messaging tool. When no channel is set, fall back to
  // the default announce delivery.
  const sendDirectly = channel && target;
  const channelPart = sendDirectly
    ? ` Channel: ${channel}. Target: ${target}.`
    : "";

  const morningMsg = `Read ${skillPath} and follow the Morning Summary Template.${channelPart}`;

  const morningArgs = [
    "cron", "add",
    "--name", "OuraClaw Morning Summary",
    "--cron", timeToCron(morningTime),
    "--tz", timezone,
    "--session", "isolated",
    "--message", morningMsg,
  ];

  if (sendDirectly) {
    morningArgs.push("--no-deliver");
  }

  runOpenclaw(morningArgs);

  const eveningMsg = `Read ${skillPath} and follow the Evening Summary Template.${channelPart}`;

  const eveningArgs = [
    "cron", "add",
    "--name", "OuraClaw Evening Summary",
    "--cron", timeToCron(eveningTime),
    "--tz", timezone,
    "--session", "isolated",
    "--message", eveningMsg,
  ];

  if (sendDirectly) {
    eveningArgs.push("--no-deliver");
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
