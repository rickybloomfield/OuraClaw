import { afterEach } from 'vitest';

afterEach(() => {
  delete process.env.OURACLAW_CLI_HOME;
  delete process.env.OURACLAW_CLI_LEGACY_CONFIG_FILE;
});
