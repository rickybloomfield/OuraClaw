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
2. Ask for fixed-threshold and baseline defaults.
3. If auth already exists, ask whether you want to re-authenticate. Default is `No`.
4. Ask whether the CLI should open the OAuth URL in a browser now.
5. Use a headless/SSH-aware default for that browser prompt and print the URL if you prefer to open it manually.
6. Store local state in `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.
7. Finish by asking `Setup complete. Continue with scheduled delivery setup? [Y/n]` when `openclaw` is installed.

The setup prompt never prints the stored client secret back to the terminal. If a secret is already stored, pressing
Enter keeps it.

## 3. Optional OpenClaw Scheduling

If OpenClaw is installed, setup can hand off directly into `ouraclaw-cli schedule setup` from the final prompt above.

That walkthrough can configure:

- a fixed morning recap
- a fixed evening recap
- an optimized morning watcher

For full scheduling details, see the [Scheduling guide](scheduling.md).

## 4. Verify Auth

After setup, check the stored auth state with:

```bash
ouraclaw-cli auth status
```

If the OAuth round-trip fails, check the redirect URI first. The most common mistake is a mismatch between the Oura app
configuration and the exact URI used by the CLI.
