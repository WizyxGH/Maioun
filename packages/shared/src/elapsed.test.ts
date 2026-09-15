import { describe, expect, it } from 'vitest';
import { formatElapsed } from './elapsed.js';

const HOUR = 60;
const DAY = 24 * HOUR;

describe('formatElapsed', () => {
  it('dit « à l’instant » sous la minute, et pour une durée négative ou invalide', () => {
    expect(formatElapsed(0.5)).toBe('à l’instant');
    expect(formatElapsed(-3)).toBe('à l’instant');
    expect(formatElapsed(Number.NaN)).toBe('à l’instant');
  });

  it('compte en minutes sous l’heure', () => {
    expect(formatElapsed(5)).toBe('il y a 5 min');
    expect(formatElapsed(59.9)).toBe('il y a 59 min');
  });

  it('compte en heures jusqu’à deux jours, arrondi vers le bas', () => {
    expect(formatElapsed(90)).toBe('il y a 1 h');
    expect(formatElapsed(3 * HOUR)).toBe('il y a 3 h');
    expect(formatElapsed(47 * HOUR + 59)).toBe('il y a 47 h');
  });

  it('compte en jours jusqu’à deux semaines', () => {
    expect(formatElapsed(2 * DAY)).toBe('il y a 2 jours');
    // Le cas qui s'affichait « il y a 15742 min ».
    expect(formatElapsed(15742)).toBe('il y a 10 jours');
    expect(formatElapsed(13 * DAY)).toBe('il y a 13 jours');
  });

  it('compte en semaines, puis en mois', () => {
    expect(formatElapsed(14 * DAY)).toBe('il y a 2 semaines');
    expect(formatElapsed(21 * DAY)).toBe('il y a 3 semaines');
    expect(formatElapsed(59 * DAY)).toBe('il y a 8 semaines');
    expect(formatElapsed(60 * DAY)).toBe('il y a 2 mois');
    expect(formatElapsed(200 * DAY)).toBe('il y a 6 mois');
  });
});
