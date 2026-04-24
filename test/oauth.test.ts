import http from 'node:http';

import { describe, expect, test } from 'vitest';

import { buildAuthorizeUrl, buildPkcePair, captureOAuthCallback } from '../src/oauth';

async function sendCallback(port: number, query: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/callback?${query}`, (res) => {
        res.resume();
        res.on('end', resolve);
      })
      .on('error', reject);
  });
}

describe('oauth', () => {
  test('builds authorize url with state and the documented redirect uri', () => {
    const result = buildAuthorizeUrl({ clientId: 'client-id' });
    const url = new URL(result.authorizeUrl);

    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('state')).toBe(result.state);
    expect(url.searchParams.get('code_challenge')).toBeNull();
    expect(url.searchParams.get('code_challenge_method')).toBeNull();
    expect(result.redirectUri).toBe('http://localhost:9876/callback');
  });

  test('creates a verifier and challenge pair', () => {
    const pair = buildPkcePair();
    expect(pair.codeVerifier.length).toBeGreaterThan(20);
    expect(pair.codeChallenge.length).toBeGreaterThan(20);
    expect(pair.codeChallenge).not.toBe(pair.codeVerifier);
  });

  test('captures oauth callback when state matches', async () => {
    const port = 19876;
    const pending = captureOAuthCallback('match-state', { port, timeoutMs: 1_000 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await sendCallback(port, 'code=auth-code&state=match-state');

    await expect(pending).resolves.toBe('auth-code');
  });

  test('rejects oauth callback when state mismatches', async () => {
    const port = 19877;
    const pending = captureOAuthCallback('expected-state', { port, timeoutMs: 1_000 });
    const assertion = expect(pending).rejects.toThrow('state mismatch');

    await new Promise((resolve) => setTimeout(resolve, 20));
    await sendCallback(port, 'code=auth-code&state=wrong-state');

    await assertion;
  });

  test('ignores stray callback requests until the real authorization arrives', async () => {
    const port = 19880;
    const pending = captureOAuthCallback('expected-state', { port, timeoutMs: 1_000 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await sendCallback(port, 'state=expected-state');
    await sendCallback(port, 'code=auth-code&state=expected-state');

    await expect(pending).resolves.toBe('auth-code');
  });

  test('times out cleanly', async () => {
    await expect(
      captureOAuthCallback('never-arrives', { port: 19878, timeoutMs: 20 })
    ).rejects.toThrow('timed out');
  });

  test('rejects explicit oauth errors', async () => {
    const port = 19879;
    const pending = captureOAuthCallback('state', { port, timeoutMs: 1_000 });
    const assertion = expect(pending).rejects.toThrow('OAuth error');

    await new Promise((resolve) => setTimeout(resolve, 20));
    await sendCallback(port, 'error=access_denied&state=state');

    await assertion;
  });
});
