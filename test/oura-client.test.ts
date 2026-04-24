import { EventEmitter } from 'node:events';
import https from 'node:https';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { buildCollectionUrl, fetchOuraData } from '../src/oura-client';

describe('oura-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('builds collection url with dates', () => {
    expect(buildCollectionUrl('daily_sleep', '2026-03-10', '2026-03-11')).toBe(
      'https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=2026-03-10&end_date=2026-03-11'
    );
  });

  test('fetches raw endpoint payload', async () => {
    const requestSpy = vi.spyOn(https, 'request').mockImplementation(((url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        setEncoding: () => void;
      };
      response.statusCode = 200;
      response.setEncoding = () => undefined;

      setImmediate(() => {
        callback?.(response as never);
        response.emit('data', '{"data":[{"id":"123"}]}');
        response.emit('end');
      });

      return {
        on: () => undefined,
        end: () => undefined,
      } as never;
    }) as typeof https.request);

    const payload = await fetchOuraData('token', 'daily_sleep', '2026-03-10', '2026-03-10');

    expect(payload).toEqual({ data: [{ id: '123' }] });
    expect(requestSpy).toHaveBeenCalled();
  });

  test('surfaces api errors', async () => {
    vi.spyOn(https, 'request').mockImplementation(((_url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode?: number;
        setEncoding: () => void;
      };
      response.statusCode = 401;
      response.setEncoding = () => undefined;

      setImmediate(() => {
        callback?.(response as never);
        response.emit('data', '{"error":"bad token"}');
        response.emit('end');
      });

      return {
        on: () => undefined,
        end: () => undefined,
      } as never;
    }) as typeof https.request);

    await expect(fetchOuraData('token', 'daily_sleep')).rejects.toThrow('Oura API error');
  });
});
