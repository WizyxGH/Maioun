import { describe, expect, it } from 'vitest';
import { collecteDue } from './collect-schedule.js';

describe('cadence nocturne de collecte', () => {
  it.each([
    ['2026-10-01T23:07:00Z', true],
    ['2026-10-02T00:07:00Z', true],
    ['2026-10-02T01:07:00Z', true],
    ['2026-10-02T02:07:00Z', true],
    ['2026-10-02T03:07:00Z', true],
    ['2026-10-01T23:27:00Z', false],
    ['2026-10-02T01:47:00Z', false],
    ['2026-10-02T02:27:00Z', false],
    ['2026-10-02T04:07:00Z', true],
    ['2026-10-02T05:07:00Z', true],
    ['2026-10-02T06:07:00Z', true],
    ['2026-10-02T06:27:00Z', true],
    ['2026-01-02T00:07:00Z', true],
    ['2026-01-02T00:27:00Z', false],
  ])('à %s UTC, collecte=%s', (instant, attendu) => {
    expect(collecteDue(new Date(instant))).toBe(attendu);
  });
});
