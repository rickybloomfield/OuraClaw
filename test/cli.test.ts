import { describe, expect, test } from 'vitest';
import { CommanderError } from 'commander';

import { createProgram } from '../src/cli';

describe('cli', () => {
  test('registers the expected top-level commands', () => {
    const commandNames = createProgram()
      .commands.map((command) => command.name())
      .sort();

    expect(commandNames).toEqual(['auth', 'baseline', 'config', 'fetch', 'setup', 'summary']);
  });

  test('registers the global version option with short and long flags', () => {
    const versionOption = createProgram().options.find((option) => option.long === '--version');

    expect(versionOption?.flags).toBe('-V, --version');
  });

  test('prints the package version for --version', async () => {
    let stdout = '';
    const program = createProgram();
    program.configureOutput({
      writeOut: (text) => {
        stdout += text;
      },
      writeErr: () => {},
    });
    program.exitOverride();

    await expect(program.parseAsync(['node', 'ouraclaw-cli', '--version'])).rejects.toMatchObject({
      code: 'commander.version',
    } satisfies Partial<CommanderError>);
    expect(stdout.trim()).toBe('0.2.0');
  });

  test('prints the package version for -V', async () => {
    let stdout = '';
    const program = createProgram();
    program.configureOutput({
      writeOut: (text) => {
        stdout += text;
      },
      writeErr: () => {},
    });
    program.exitOverride();

    await expect(program.parseAsync(['node', 'ouraclaw-cli', '-V'])).rejects.toMatchObject({
      code: 'commander.version',
    } satisfies Partial<CommanderError>);
    expect(stdout.trim()).toBe('0.2.0');
  });
});
