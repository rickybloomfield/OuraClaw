import { EventEmitter } from 'node:events';
import https from 'node:https';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { exchangeCodeForTokens, refreshAccessToken } from '../src/oauth';

describe('oauth token exchange', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exchanges code for tokens', async () => {
    vi.spyOn(https, 'request').mockImplementation(((_options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        setEncoding: () => void;
      };
      response.statusCode = 200;
      response.setEncoding = () => undefined;

      setImmediate(() => {
        callback?.(response as never);
        response.emit(
          'data',
          '{"access_token":"access","refresh_token":"refresh","expires_in":3600,"token_type":"Bearer"}'
        );
        response.emit('end');
      });

      return {
        on: () => undefined,
        write: () => undefined,
        end: () => undefined,
      } as never;
    }) as typeof https.request);

    await expect(exchangeCodeForTokens('id', 'secret', 'code', 'verifier')).resolves.toMatchObject({
      access_token: 'access',
      refresh_token: 'refresh',
    });
  });

  test('refreshes access tokens', async () => {
    vi.spyOn(https, 'request').mockImplementation(((_options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        setEncoding: () => void;
      };
      response.statusCode = 200;
      response.setEncoding = () => undefined;

      setImmediate(() => {
        callback?.(response as never);
        response.emit(
          'data',
          '{"access_token":"access-2","refresh_token":"refresh-2","expires_in":3600,"token_type":"Bearer"}'
        );
        response.emit('end');
      });

      return {
        on: () => undefined,
        write: () => undefined,
        end: () => undefined,
      } as never;
    }) as typeof https.request);

    await expect(refreshAccessToken('id', 'secret', 'refresh')).resolves.toMatchObject({
      access_token: 'access-2',
    });
  });
});
