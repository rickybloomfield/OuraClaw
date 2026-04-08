import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { CommanderError } from 'commander';

import { createProgram } from '../src/cli';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as {
  version: string;
  engines: {
    node: string;
  };
};
const packageVersion = packageJson.version;

describe('cli', () => {
  test('registers the expected top-level commands', () => {
    const commandNames = createProgram()
      .commands.map((command) => command.name())
      .sort();

    expect(commandNames).toEqual([
      'auth',
      'baseline',
      'config',
      'fetch',
      'schedule',
      'setup',
      'summary',
    ]);
  });

  test('registers the global version option with short and long flags', () => {
    const versionOption = createProgram().options.find((option) => option.long === '--version');

    expect(versionOption?.flags).toBe('-V, --version');
  });

  test('registers the morning optimized confirmation command', () => {
    const summaryCommand = createProgram().commands.find((command) => command.name() === 'summary');
    const summarySubcommands = summaryCommand?.commands.map((command) => command.name()).sort();

    expect(summarySubcommands).toContain('morning-optimized-confirm');
  });

  test('registers the schedule management commands', () => {
    const scheduleCommand = createProgram().commands.find(
      (command) => command.name() === 'schedule'
    );
    const scheduleSubcommands = scheduleCommand?.commands.map((command) => command.name()).sort();

    expect(scheduleSubcommands).toEqual([
      'disable',
      'migrate-from-ouraclaw-plugin',
      'setup',
      'status',
    ]);
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
    expect(stdout.trim()).toBe(packageVersion);
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
    expect(stdout.trim()).toBe(packageVersion);
  });

  test('declares a Node 20 engine floor', () => {
    expect(packageJson.engines.node).toBe('>=20.0.0');
  });
});
