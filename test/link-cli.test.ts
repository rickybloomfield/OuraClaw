import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, test } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');
const packageName = '@robertvii/ouraclaw-cli';
const scopePath = path.join(...packageName.split('/').slice(0, -1));
const packageLeaf = packageName.split('/').at(-1) ?? '';

function makeExecutable(filePath: string, contents: string): void {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function writeFakeNpm(binDir: string): void {
  makeExecutable(
    path.join(binDir, 'npm'),
    `#!/usr/bin/env bash
set -euo pipefail

global_root="\${FAKE_NPM_GLOBAL_ROOT:?}"
log_file="\${FAKE_NPM_LOG:?}"
package_name='${packageName}'
package_path="$global_root/$package_name"

log_call() {
  printf '%s\\n' "$*" >> "$log_file"
}

if [[ "$#" -eq 2 && "$1" == "root" && "$2" == "-g" ]]; then
  echo "$global_root"
  exit 0
fi

if [[ "$#" -eq 1 && "$1" == "install" ]]; then
  log_call "install"
  exit 0
fi

if [[ "$#" -eq 2 && "$1" == "run" && "$2" == "build" ]]; then
  log_call "run build"
  exit 0
fi

if [[ "$#" -eq 1 && "$1" == "link" ]]; then
  mkdir -p "$(dirname "$package_path")"
  rm -rf "$package_path"
  ln -s "$PWD" "$package_path"
  log_call "link"
  exit 0
fi

if [[ "$#" -eq 3 && "$1" == "unlink" && "$2" == "-g" && "$3" == "$package_name" ]]; then
  rm -f "$package_path"
  log_call "unlink -g $3"
  exit 0
fi

echo "unexpected npm invocation: $*" >&2
exit 1
`
  );
}

function writeFakeCli(binDir: string): void {
  makeExecutable(
    path.join(binDir, 'ouraclaw-cli'),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 1 && "$1" == "--version" ]]; then
  echo "9.9.9-test"
  exit 0
fi

echo "unexpected ouraclaw-cli invocation: $*" >&2
exit 1
`
  );
}

function createHarness() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'ouraclaw-cli-link-'));
  const globalRoot = path.join(tempRoot, 'global');
  const binDir = path.join(tempRoot, 'bin');
  const logFile = path.join(tempRoot, 'npm.log');

  mkdirSync(globalRoot, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(logFile, '');
  writeFakeNpm(binDir);
  writeFakeCli(binDir);

  return {
    tempRoot,
    globalRoot,
    logFile,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FAKE_NPM_GLOBAL_ROOT: globalRoot,
      FAKE_NPM_LOG: logFile,
    },
    globalPackagePath: path.join(globalRoot, scopePath, packageLeaf),
  };
}

function readLog(logFile: string): string[] {
  return readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
}

afterEach(() => {
  for (const dir of (globalThis as { __linkCliTemps?: string[] }).__linkCliTemps ?? []) {
    rmSync(dir, { recursive: true, force: true });
  }
  (globalThis as { __linkCliTemps?: string[] }).__linkCliTemps = [];
});

function trackTemp(tempRoot: string): void {
  const state = globalThis as { __linkCliTemps?: string[] };
  state.__linkCliTemps ??= [];
  state.__linkCliTemps.push(tempRoot);
}

describe('link-cli scripts', () => {
  test('link-cli aborts when the package is globally installed without a symlink', () => {
    const harness = createHarness();
    trackTemp(harness.tempRoot);

    mkdirSync(path.dirname(harness.globalPackagePath), { recursive: true });
    mkdirSync(harness.globalPackagePath, { recursive: true });

    const result = spawnSync('bash', [path.join(repoRoot, 'link-cli.sh')], {
      cwd: repoRoot,
      env: harness.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`npm uninstall -g ${packageName}`);
    expect(readLog(harness.logFile)).toEqual([]);
  });

  test('link-cli reinstalls, rebuilds, and relinks when no conflicting global install exists', () => {
    const harness = createHarness();
    trackTemp(harness.tempRoot);

    const result = spawnSync('bash', [path.join(repoRoot, 'link-cli.sh')], {
      cwd: repoRoot,
      env: harness.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readLog(harness.logFile)).toEqual(['install', 'run build', 'link']);
    expect(result.stdout).toContain('ouraclaw-cli linked:');
    expect(result.stdout).toContain(path.join(harness.tempRoot, 'bin', 'ouraclaw-cli'));
    expect(result.stdout).toContain('9.9.9-test');
  });

  test('link-cli proceeds when the global package is already a symlink', () => {
    const harness = createHarness();
    trackTemp(harness.tempRoot);

    mkdirSync(path.dirname(harness.globalPackagePath), { recursive: true });
    symlinkSync(repoRoot, harness.globalPackagePath);

    const result = spawnSync('bash', [path.join(repoRoot, 'link-cli.sh')], {
      cwd: repoRoot,
      env: harness.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readLog(harness.logFile)).toEqual(['install', 'run build', 'link']);
  });

  test('unlink-cli removes an existing global symlink', () => {
    const harness = createHarness();
    trackTemp(harness.tempRoot);

    mkdirSync(path.dirname(harness.globalPackagePath), { recursive: true });
    symlinkSync(repoRoot, harness.globalPackagePath);

    const result = spawnSync('bash', [path.join(repoRoot, 'unlink-cli.sh')], {
      cwd: repoRoot,
      env: harness.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readLog(harness.logFile)).toEqual([`unlink -g ${packageName}`]);
    expect(result.stdout).toContain(`Removed global npm link for ${packageName}.`);
  });

  test('unlink-cli is a no-op when no global symlink exists', () => {
    const harness = createHarness();
    trackTemp(harness.tempRoot);

    const result = spawnSync('bash', [path.join(repoRoot, 'unlink-cli.sh')], {
      cwd: repoRoot,
      env: harness.env,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(readLog(harness.logFile)).toEqual([]);
    expect(result.stdout).toContain(`No global npm link present for ${packageName}.`);
  });
});
