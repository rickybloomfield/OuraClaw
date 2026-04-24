import { describe, expect, test } from 'vitest';

import { getExternalOpenCommand } from '../src/cli';

describe('getExternalOpenCommand', () => {
  test('prefers the BROWSER environment variable when provided', () => {
    expect(
      getExternalOpenCommand('https://example.com', { BROWSER: '/usr/bin/firefox' }, 'linux')
    ).toEqual({
      kind: 'exec',
      command: '"/usr/bin/firefox" "https://example.com"',
    });
  });

  test('uses open on macOS by default', () => {
    expect(getExternalOpenCommand('https://example.com', {}, 'darwin')).toEqual({
      kind: 'execFile',
      file: 'open',
      args: ['https://example.com'],
    });
  });

  test('uses start on Windows by default', () => {
    expect(getExternalOpenCommand('https://example.com', {}, 'win32')).toEqual({
      kind: 'execFile',
      file: 'cmd',
      args: ['/c', 'start', '', 'https://example.com'],
    });
  });

  test('uses xdg-open on Linux by default', () => {
    expect(getExternalOpenCommand('https://example.com', {}, 'linux')).toEqual({
      kind: 'execFile',
      file: 'xdg-open',
      args: ['https://example.com'],
    });
  });
});
