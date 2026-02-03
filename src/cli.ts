import readline from "readline";
import { exec, execSync, execFileSync } from "child_process";
import { OuraConfig } from "./types";
import {
  buildAuthorizeUrl,
  captureOAuthCallback,
  exchangeCodeForTokens,
} from "./oauth";
import { readConfig, updateConfig, saveTokens } from "./token-store";
import { createCronJobs, removeCronJobs } from "./cron-setup";
import { fetchOuraData } from "./oura-client";

function createPromptInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  return new Promise((resolve) => {
    rl.question(`${question}${suffix} `, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function confirm(rl: readline.Interface, question: string, defaultYes: boolean = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

function select(rl: readline.Interface, question: string, choices: string[], defaultIndex?: number): Promise<string> {
  return new Promise((resolve) => {
    console.log(question);
    choices.forEach((c, i) => {
      const marker = defaultIndex === i ? " *" : "";
      console.log(`  ${i + 1}. ${c}${marker}`);
    });
    const defaultHint = defaultIndex !== undefined ? ` (${defaultIndex + 1})` : "";
    rl.question(`Choose [1-${choices.length}]${defaultHint}: `, (answer) => {
      if (answer.trim() === "" && defaultIndex !== undefined) {
        resolve(choices[defaultIndex]);
        return;
      }
      const idx = parseInt(answer.trim(), 10) - 1;
      resolve(choices[idx] || choices[defaultIndex ?? 0]);
    });
  });
}

function openUrl(url: string): void {
  const browser = process.env.BROWSER;
  const cmd =
    browser
      ? `"${browser}" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
          ? `start "${url}"`
          : `xdg-open "${url}"`;
  exec(cmd);
}

function withProgress<T>(message: string, fn: () => T): T {
  process.stdout.write(`${message}...`);
  try {
    const result = fn();
    if (result instanceof Promise) {
      return (result as any).then((val: T) => {
        process.stdout.write(" done.\n");
        return val;
      }).catch((err: any) => {
        process.stdout.write(" failed.\n");
        throw err;
      });
    }
    process.stdout.write(" done.\n");
    return result;
  } catch (err) {
    process.stdout.write(" failed.\n");
    throw err;
  }
}

interface ChannelTarget {
  label: string;
  channel: string;
  target: string;
}

function getChannelConfig(channelId: string): any {
  try {
    const output = execFileSync("openclaw", ["config", "get", `channels.${channelId}`], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function getConfiguredChannelTargets(): ChannelTarget[] {
  // First, get the list of configured channels
  let channelIds: string[] = [];
  try {
    const output = execSync("openclaw channels list --json --no-usage", {
      encoding: "utf-8",
      timeout: 10_000,
    });
    const data = JSON.parse(output);
    const chat = data?.chat;
    if (chat && typeof chat === "object") {
      channelIds = Object.keys(chat);
    }
  } catch {
    return [];
  }

  // Then read each channel's config to get allowFrom targets
  const targets: ChannelTarget[] = [];
  for (const channelId of channelIds) {
    const config = getChannelConfig(channelId);
    if (!config) continue;

    const allowFrom: string[] = config.allowFrom || [];
    for (const contact of allowFrom) {
      targets.push({
        label: `${channelId} → ${contact}`,
        channel: channelId,
        target: contact,
      });
    }
  }

  return targets;
}

export function registerCli(api: any) {
  api.registerCli(
    ({ program }: { program: any }) => {
      const ouraclaw = program
        .command("ouraclaw")
        .description("OuraClaw — Oura Ring integration");

      ouraclaw
        .command("setup")
        .description("Set up Oura Ring connection and scheduled summaries")
        .action(() => setupCommand());

      ouraclaw
        .command("status")
        .description("Show current OuraClaw connection status")
        .action(() => statusCommand());

      ouraclaw
        .command("test")
        .description("Fetch today's Oura data to verify connection")
        .action(() => testCommand());
    },
    { commands: ["ouraclaw"] },
  );
}

async function setupCommand(): Promise<void> {
  const rl = createPromptInterface();
  const existing = readConfig();
  const isRerun = !!(existing.clientId || existing.accessToken);

  try {
    console.log("\n=== OuraClaw Setup ===\n");

    if (isRerun) {
      console.log("Existing configuration detected. Press Enter to keep current values or enter different values.\n");
    } else {
      console.log("Before proceeding, create an Oura application:");
      console.log("  1. Go to https://developer.ouraring.com");
      console.log('  2. Navigate to "My Applications"');
      console.log("  3. Create a new application");
      console.log("  4. Set the redirect URI to: http://localhost:9876/callback");
      console.log("");
    }

    // Step 1: Credentials
    const clientId = await ask(rl, "Oura Client ID:", existing.clientId);
    const clientSecret = await ask(rl, "Oura Client Secret:", existing.clientSecret);

    withProgress("Saving credentials", () => updateConfig({ clientId, clientSecret }));

    // Step 2: OAuth flow
    let skipOAuth = false;
    if (isRerun && existing.accessToken) {
      skipOAuth = !(await confirm(rl, "Re-authorize with Oura? (only needed if tokens are broken)", false));
    }

    if (!skipOAuth) {
      const authorizeUrl = buildAuthorizeUrl(clientId);
      console.log("\nOpening browser to authorize OuraClaw...");
      openUrl(authorizeUrl);

      console.log("Waiting for OAuth callback on http://localhost:9876/callback ...");
      const code = await captureOAuthCallback();

      await withProgress("Exchanging code for tokens", async () => {
        const tokenResponse = await exchangeCodeForTokens(clientId, clientSecret, code);
        saveTokens(tokenResponse);
      });
      console.log("");
    } else {
      console.log("Skipping OAuth — keeping existing tokens.\n");
    }

    // Step 3: Channel + target preference
    const availableTargets = withProgress("Loading configured channels", () => getConfiguredChannelTargets());

    let channel = "default";
    let channelTarget: string | undefined;

    if (availableTargets.length === 0) {
      console.log("No messaging channels configured. Using default (active channel at delivery time).");
    } else {
      const choices = [
        "default (active channel at delivery time)",
        ...availableTargets.map((t) => t.label),
      ];

      // Find the existing selection to use as default
      let defaultIdx = 0;
      if (isRerun && existing.preferredChannel && existing.preferredChannelTarget) {
        const existingLabel = availableTargets.find(
          (t) => t.channel === existing.preferredChannel && t.target === existing.preferredChannelTarget,
        )?.label;
        if (existingLabel) {
          const idx = choices.indexOf(existingLabel);
          if (idx >= 0) defaultIdx = idx;
        }
      } else if (isRerun && existing.preferredChannel === "default") {
        defaultIdx = 0;
      }

      const chosen = await select(rl, "Deliver summaries to:", choices, defaultIdx);
      if (!chosen.startsWith("default")) {
        const match = availableTargets.find((t) => t.label === chosen);
        if (match) {
          channel = match.channel;
          channelTarget = match.target;
        }
      }
    }

    updateConfig({
      preferredChannel: channel,
      preferredChannelTarget: channelTarget,
    });

    // Step 4: Schedule
    const enableScheduled = await confirm(
      rl,
      "Enable scheduled morning & evening summaries?",
      existing.scheduledMessages !== false,
    );

    if (enableScheduled) {
      const morningTime = await ask(rl, "Morning summary time (HH:MM):", existing.morningTime || "07:00");
      const eveningTime = await ask(rl, "Evening summary time (HH:MM):", existing.eveningTime || "21:00");
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log(`  Timezone: ${timezone} (detected from system)`);

      updateConfig({
        scheduledMessages: true,
        morningTime,
        eveningTime,
        timezone,
      });

      withProgress("\nScheduling daily summaries", () => createCronJobs(readConfig()));
    } else {
      updateConfig({ scheduledMessages: false });

      const config = readConfig();
      if (config.morningCronJobId || config.eveningCronJobId) {
        withProgress("Removing existing cron jobs", () => removeCronJobs(config));
      }
    }

    // Summary
    const finalConfig = readConfig();
    console.log("\n=== Setup Complete ===");
    console.log(`  Client ID: ${finalConfig.clientId}`);
    console.log(`  Token expires: ${new Date(finalConfig.tokenExpiresAt!).toLocaleString()}`);
    console.log(`  Channel: ${finalConfig.preferredChannel || "default"}`);
    if (finalConfig.preferredChannelTarget) {
      console.log(`  Channel target: ${finalConfig.preferredChannelTarget}`);
    }
    if (finalConfig.scheduledMessages) {
      console.log(`  Morning summary: ${finalConfig.morningTime} ${finalConfig.timezone}`);
      console.log(`  Evening summary: ${finalConfig.eveningTime} ${finalConfig.timezone}`);
    } else {
      console.log("  Scheduled messages: disabled");
    }
    console.log("\nYou can now ask your agent about your Oura data!");
    console.log('Try: "How did I sleep last night?"\n');
  } finally {
    rl.close();
  }
}

async function statusCommand(): Promise<void> {
  const config = readConfig();

  console.log("\n=== OuraClaw Status ===\n");

  if (!config.accessToken) {
    console.log("  Status: Not connected");
    console.log('  Run "openclaw ouraclaw setup" to get started.\n');
    return;
  }

  console.log("  Status: Connected");
  console.log(`  Client ID: ${config.clientId || "not set"}`);

  if (config.tokenExpiresAt) {
    const expiry = new Date(config.tokenExpiresAt);
    const now = new Date();
    const hoursLeft = Math.round(
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60),
    );
    console.log(`  Token expires: ${expiry.toLocaleString()} (${hoursLeft}h from now)`);
  }

  console.log(`  Channel: ${config.preferredChannel || "default"}`);
  if (config.preferredChannelTarget) {
    console.log(`  Channel target: ${config.preferredChannelTarget}`);
  }

  if (config.scheduledMessages) {
    console.log(`  Morning summary: ${config.morningTime} ${config.timezone}`);
    console.log(`  Evening summary: ${config.eveningTime} ${config.timezone}`);
    console.log(`  Morning job ID: ${config.morningCronJobId || "none"}`);
    console.log(`  Evening job ID: ${config.eveningCronJobId || "none"}`);
  } else {
    console.log("  Scheduled messages: disabled");
  }

  console.log("");
}

async function testCommand(): Promise<void> {
  const config = readConfig();

  if (!config.accessToken) {
    console.log('Not connected. Run "openclaw ouraclaw setup" first.');
    return;
  }

  console.log("\nFetching today's Oura data...\n");

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];

  try {
    const sleep = await fetchOuraData(
      config.accessToken,
      "daily_sleep",
      today,
      tomorrow,
    );
    console.log(`Daily Sleep: ${JSON.stringify(sleep, null, 2)}\n`);

    const readiness = await fetchOuraData(
      config.accessToken,
      "daily_readiness",
      today,
      tomorrow,
    );
    console.log(`Daily Readiness: ${JSON.stringify(readiness, null, 2)}\n`);

    const activity = await fetchOuraData(
      config.accessToken,
      "daily_activity",
      today,
      tomorrow,
    );
    console.log(`Daily Activity: ${JSON.stringify(activity, null, 2)}\n`);

    console.log("Connection test successful!");
  } catch (err: any) {
    console.log(`Error fetching data: ${err.message}`);
    console.log('You may need to re-run "openclaw ouraclaw setup" to refresh your token.');
  }

  console.log("");
}
