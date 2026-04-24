import { afterEach, describe, expect, test, vi } from 'vitest';

import { printJson, printText } from '../src/output';

describe('output', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('prints json', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    printJson({ ok: true });
    expect(spy).toHaveBeenCalledWith('{\n  "ok": true\n}\n');
  });

  test('prints text', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    printText('hello');
    expect(spy).toHaveBeenCalledWith('hello\n');
  });
});
