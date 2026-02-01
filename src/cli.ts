import { OuraConfig } from "./types";
import {
  buildAuthorizeUrl,
  captureOAuthCallback,
  exchangeCodeForTokens,
} from "./oauth";
import { saveTokens } from "./token-store";
import { createCronJobs, removeCronJobs } from "./cron-setup";
import { fetchOuraData } from "./oura-client";

interface CliContext {
  getConfig: () => OuraConfig;
  updateConfig: (updates: Partial<OuraConfig>) => void;
  prompt: (message: string, defaultValue?: string) => Promise<string>;
  select: (message: string, choices: string[]) => Promise<string>;
  confirm: (message: string, defaultValue?: boolean) => Promise<boolean>;
  log: (message: string) => void;
  openUrl: (url: string) => void;
  registerCronJob: (job: any) => void;
  unregisterCronJob: (id: string) => void;
}

export function registerCli(ctx: CliContext) {
  return {
    name: "ouraclaw",
    description: "OuraClaw — Oura Ring integration",
    subcommands: {
      setup: {
        description: "Set up Oura Ring connection and scheduled summaries",
        handler: () => setupCommand(ctx),
      },
      status: {
        description: "Show current OuraClaw connection status",
        handler: () => statusCommand(ctx),
      },
      test: {
        description: "Fetch today's Oura data to verify connection",
        handler: () => testCommand(ctx),
      },
    },
  };
}

async function setupCommand(ctx: CliContext): Promise<void> {
  const { log, prompt, select, confirm, openUrl, getConfig, updateConfig } = ctx;

  log("\n=== OuraClaw Setup ===\n");
  log("Before proceeding, create an Oura application:");
  log("  1. Go to https://cloud.ouraring.com");
  log('  2. Navigate to "My Applications"');
  log("  3. Create a new application");
  log("  4. Set the redirect URI to: http://localhost:9876/callback");
  log("");

  // Step 1: Credentials
  const clientId = await prompt("Enter your Oura Client ID:");
  const clientSecret = await prompt("Enter your Oura Client Secret:");

  updateConfig({ clientId, clientSecret });

  // Step 2: OAuth flow
  log("\nStarting OAuth authorization...");
  const authorizeUrl = buildAuthorizeUrl(clientId);
  log(`Opening browser to authorize OuraClaw...`);
  openUrl(authorizeUrl);

  log("Waiting for OAuth callback on http://localhost:9876/callback ...");
  const code = await captureOAuthCallback();
  log("Authorization code received! Exchanging for tokens...");

  const tokenResponse = await exchangeCodeForTokens(clientId, clientSecret, code);
  saveTokens(getConfig(), tokenResponse, updateConfig);
  log("Tokens saved successfully.\n");

  // Step 3: Channel preference
  const channelChoice = await select("Preferred delivery channel:", [
    "default (active channel at delivery time)",
    "imessage",
    "slack",
    "discord",
    "telegram",
  ]);

  const channel = channelChoice.startsWith("default") ? "default" : channelChoice;
  let channelTarget: string | undefined;

  if (channel !== "default") {
    channelTarget = await prompt(
      `Enter the target for ${channel} (phone number, webhook URL, chat ID, etc.):`,
    );
  }

  updateConfig({
    preferredChannel: channel,
    preferredChannelTarget: channelTarget,
  });

  // Step 4: Schedule
  const enableScheduled = await confirm(
    "Enable scheduled morning & evening summaries?",
    true,
  );

  if (enableScheduled) {
    const morningTime = await prompt("Morning summary time (HH:MM):", "07:00");
    const eveningTime = await prompt("Evening summary time (HH:MM):", "21:00");
    const timezone = await prompt(
      "Timezone (e.g. America/New_York):",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );

    updateConfig({
      scheduledMessages: true,
      morningTime,
      eveningTime,
      timezone,
    });

    // Remove existing cron jobs before creating new ones
    const config = getConfig();
    if (config.morningCronJobId || config.eveningCronJobId) {
      removeCronJobs(config, updateConfig, ctx.unregisterCronJob);
    }

    createCronJobs(getConfig(), updateConfig, ctx.registerCronJob);
    log("\nCron jobs created for morning and evening summaries.");
  } else {
    updateConfig({ scheduledMessages: false });

    // Remove existing cron jobs if any
    const config = getConfig();
    if (config.morningCronJobId || config.eveningCronJobId) {
      removeCronJobs(config, updateConfig, ctx.unregisterCronJob);
      log("\nExisting cron jobs removed.");
    }
  }

  // Summary
  const finalConfig = getConfig();
  log("\n=== Setup Complete ===");
  log(`  Client ID: ${finalConfig.clientId}`);
  log(`  Token expires: ${new Date(finalConfig.tokenExpiresAt!).toLocaleString()}`);
  log(`  Channel: ${finalConfig.preferredChannel || "default"}`);
  if (finalConfig.preferredChannelTarget) {
    log(`  Channel target: ${finalConfig.preferredChannelTarget}`);
  }
  if (finalConfig.scheduledMessages) {
    log(`  Morning summary: ${finalConfig.morningTime} ${finalConfig.timezone}`);
    log(`  Evening summary: ${finalConfig.eveningTime} ${finalConfig.timezone}`);
  } else {
    log("  Scheduled messages: disabled");
  }
  log("\nYou can now ask your agent about your Oura data!");
  log('Try: "How did I sleep last night?"\n');
}

async function statusCommand(ctx: CliContext): Promise<void> {
  const { log, getConfig } = ctx;
  const config = getConfig();

  log("\n=== OuraClaw Status ===\n");

  if (!config.accessToken) {
    log("  Status: Not connected");
    log('  Run "openclaw ouraclaw setup" to get started.\n');
    return;
  }

  log("  Status: Connected");
  log(`  Client ID: ${config.clientId || "not set"}`);

  if (config.tokenExpiresAt) {
    const expiry = new Date(config.tokenExpiresAt);
    const now = new Date();
    const hoursLeft = Math.round(
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60),
    );
    log(`  Token expires: ${expiry.toLocaleString()} (${hoursLeft}h from now)`);
  }

  log(`  Channel: ${config.preferredChannel || "default"}`);
  if (config.preferredChannelTarget) {
    log(`  Channel target: ${config.preferredChannelTarget}`);
  }

  if (config.scheduledMessages) {
    log(`  Morning summary: ${config.morningTime} ${config.timezone}`);
    log(`  Evening summary: ${config.eveningTime} ${config.timezone}`);
    log(`  Morning job ID: ${config.morningCronJobId || "none"}`);
    log(`  Evening job ID: ${config.eveningCronJobId || "none"}`);
  } else {
    log("  Scheduled messages: disabled");
  }

  log("");
}

async function testCommand(ctx: CliContext): Promise<void> {
  const { log, getConfig } = ctx;
  const config = getConfig();

  if (!config.accessToken) {
    log('Not connected. Run "openclaw ouraclaw setup" first.');
    return;
  }

  log("\nFetching today's Oura data...\n");

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];

  try {
    const sleep = await fetchOuraData(
      config.accessToken,
      "daily_sleep",
      today,
      tomorrow,
    );
    log(`Daily Sleep: ${JSON.stringify(sleep, null, 2)}\n`);

    const readiness = await fetchOuraData(
      config.accessToken,
      "daily_readiness",
      today,
      tomorrow,
    );
    log(`Daily Readiness: ${JSON.stringify(readiness, null, 2)}\n`);

    const activity = await fetchOuraData(
      config.accessToken,
      "daily_activity",
      today,
      tomorrow,
    );
    log(`Daily Activity: ${JSON.stringify(activity, null, 2)}\n`);

    log("Connection test successful!");
  } catch (err: any) {
    log(`Error fetching data: ${err.message}`);
    log('You may need to re-run "openclaw ouraclaw setup" to refresh your token.');
  }

  log("");
}
