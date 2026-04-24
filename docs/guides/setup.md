# Setup Guide

This guide covers the first-run path for `ouraclaw-cli`, including how to create the Oura application that the CLI
needs for OAuth.

`ouraclaw-cli` requires Node.js 20 or newer.

## 1. Create an Oura Application

Before running `ouraclaw-cli setup`, create an app in the Oura developer portal:

1. Go to [https://developer.ouraring.com](https://developer.ouraring.com).
2. Open `My Applications`.
3. Create a new application.
4. Set the redirect URI to:

   ```text
   http://localhost:9876/callback
   ```

That redirect URI must match exactly. Oura validates the string literally.

After the app is created, keep the `Client ID` and `Client Secret` handy for the CLI setup wizard.

## 2. Run the CLI Setup Wizard

Run:

```bash
ouraclaw-cli setup
```

The wizard will:

1. Ask for your Oura `Client ID` and `Client Secret`.
2. If auth already exists, ask whether you want to re-authenticate. Default is `No`.
3. Ask whether the CLI should open the OAuth URL in a browser now when OAuth is needed.
4. Use a headless/SSH-aware default for that browser prompt and print the URL if you prefer to open it manually.
5. Ask for fixed-threshold and baseline defaults.
6. Store local state in `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.
7. Finish by asking `Setup complete. Continue with OpenClaw scheduled delivery setup? [Y/n]` when `openclaw` is
   installed.

The setup prompt never prints the stored client secret back to the terminal. If a secret is already stored, pressing
Enter keeps it.

If you only need to re-authenticate with Oura, run:

```bash
ouraclaw-cli auth login
```

That command updates OAuth tokens without walking through thresholds, baseline tuning, or scheduling.

## 3. Optional OpenClaw Scheduling

If OpenClaw is installed, setup can hand off directly into `ouraclaw-cli schedule setup` from the final prompt above.
If OpenClaw is not installed, setup still completes the standalone CLI configuration and prints a short note before the
JSON result. The final JSON uses `deliverySetup` to report that OpenClaw delivery was skipped while the CLI remains
fully usable for manual commands or another scheduler.

That walkthrough can configure:

- a morning summary watcher
- a fixed evening recap
- a fixed weekly overview

For full scheduling details, see the [Scheduling guide](scheduling.md).

## 4. Verify Auth

After setup, check the stored auth state with:

```bash
ouraclaw-cli auth status
```

If the OAuth round-trip fails, check the redirect URI first. The most common mistake is a mismatch between the Oura app
configuration and the exact URI used by the CLI.
