import readline from "readline";
import { exec } from "child_process";
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

function select(rl: readline.Interface, question: string, choices: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(question);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    rl.question(`Choose [1-${choices.length}]: `, (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      resolve(choices[idx] || choices[0]);
    });
  });
}

function openUrl(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
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

  try {
    console.log("\n=== OuraClaw Setup ===\n");
    console.log("Before proceeding, create an Oura application:");
    console.log("  1. Go to https://cloud.ouraring.com");
    console.log('  2. Navigate to "My Applications"');
    console.log("  3. Create a new application");
    console.log("  4. Set the redirect URI to: http://localhost:9876/callback");
    console.log("");

    // Step 1: Credentials
    const clientId = await ask(rl, "Enter your Oura Client ID:");
    const clientSecret = await ask(rl, "Enter your Oura Client Secret:");

    updateConfig({ clientId, clientSecret });

    // Step 2: OAuth flow
    console.log("\nStarting OAuth authorization...");
    const authorizeUrl = buildAuthorizeUrl(clientId);
    console.log("Opening browser to authorize OuraClaw...");
    openUrl(authorizeUrl);

    console.log("Waiting for OAuth callback on http://localhost:9876/callback ...");
    const code = await captureOAuthCallback();
    console.log("Authorization code received! Exchanging for tokens...");

    const tokenResponse = await exchangeCodeForTokens(clientId, clientSecret, code);
    saveTokens(tokenResponse);
    console.log("Tokens saved successfully.\n");

    // Step 3: Channel preference
    const channelChoice = await select(rl, "Preferred delivery channel:", [
      "default (active channel at delivery time)",
      "imessage",
      "slack",
      "discord",
      "telegram",
    ]);

    const channel = channelChoice.startsWith("default") ? "default" : channelChoice;
    let channelTarget: string | undefined;

    if (channel !== "default") {
      channelTarget = await ask(
        rl,
        `Enter the target for ${channel} (phone number, webhook URL, chat ID, etc.):`,
      );
    }

    updateConfig({
      preferredChannel: channel,
      preferredChannelTarget: channelTarget,
    });

    // Step 4: Schedule
    const enableScheduled = await confirm(
      rl,
      "Enable scheduled morning & evening summaries?",
      true,
    );

    if (enableScheduled) {
      const morningTime = await ask(rl, "Morning summary time (HH:MM):", "07:00");
      const eveningTime = await ask(rl, "Evening summary time (HH:MM):", "21:00");
      const timezone = await ask(
        rl,
        "Timezone (e.g. America/New_York):",
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );

      updateConfig({
        scheduledMessages: true,
        morningTime,
        eveningTime,
        timezone,
      });

      createCronJobs(readConfig());
      console.log("\nCron jobs created for morning and evening summaries.");
    } else {
      updateConfig({ scheduledMessages: false });

      const config = readConfig();
      if (config.morningCronJobId || config.eveningCronJobId) {
        removeCronJobs(config);
        console.log("\nExisting cron jobs removed.");
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
