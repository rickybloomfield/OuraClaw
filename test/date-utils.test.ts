import { describe, expect, test } from 'vitest';

import {
  addDays,
  compareIsoDates,
  formatDisplayDate,
  formatDuration,
  getIsoWeekString,
  getTodayIsoDate,
  parseIsoDate,
  toIsoDate,
} from '../src/date-utils';

describe('date-utils', () => {
  test('formats and parses iso dates', () => {
    const date = parseIsoDate('2026-03-13');
    expect(toIsoDate(date)).toBe('2026-03-13');
    expect(getTodayIsoDate(new Date(Date.UTC(2026, 2, 13)))).toBe('2026-03-13');
  });

  test('adds days and compares iso dates', () => {
    const date = addDays(parseIsoDate('2026-03-13'), -1);
    expect(toIsoDate(date)).toBe('2026-03-12');
    expect(compareIsoDates('2026-03-12', '2026-03-13')).toBeLessThan(0);
  });

  test('formats durations and display dates', () => {
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(null)).toBe('n/a');
    expect(formatDisplayDate('2026-03-13')).toContain('Mar');
  });

  test('computes iso week strings', () => {
    expect(getIsoWeekString(parseIsoDate('2026-03-13'))).toBe('2026-W11');
  });
});
