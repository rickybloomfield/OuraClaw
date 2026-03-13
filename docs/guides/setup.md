# Setup Guide

This guide covers the first-run path for `ouraclaw-cli`, including how to create the Oura application that the CLI
needs for OAuth.

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
3. Open the browser for OAuth authorization.
4. Store local state in `$HOME/.ouraclaw-cli/ouraclaw-cli.json`.
5. If `openclaw` is installed, optionally continue into cron scheduling setup.

## 3. Optional OpenClaw Scheduling

If OpenClaw is installed, setup can hand off directly into `ouraclaw-cli schedule setup`.

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
