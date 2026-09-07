import { describe, expect, it } from 'vitest';
import { formatPhone, parsePhone } from './phone.js';

describe('parsePhone', () => {
  it('lit un numéro français saisi comme on le tape', () => {
    // Le zéro initial disparaît à l'international : c'est le geste que tout le
    // monde fait de travers.
    expect(parsePhone('06 00 00 00 12')).toEqual({ country: 'FR', national: '600000012' });
    expect(parsePhone('0600000012')).toEqual({ country: 'FR', national: '600000012' });
  });

  it('reconnaît l’indicatif d’un numéro déjà international', () => {
    expect(parsePhone('+33600000012')).toEqual({ country: 'FR', national: '600000012' });
    expect(parsePhone('+32 400 00 00 12')).toEqual({ country: 'BE', national: '400000012' });
    expect(parsePhone('0033600000012')).toEqual({ country: 'FR', national: '600000012' });
  });

  it('essaie les indicatifs du plus LONG au plus court', () => {
    // `+377` (Monaco) commence par `+3`, et `+1` est un préfixe de tout ce qui
    // commence par 1 : sans ce tri, ces numéros seraient rangés sous le mauvais
    // pays, avec un numéro national amputé.
    expect(parsePhone('+377900000012')).toEqual({ country: 'MC', national: '900000012' });
    expect(parsePhone('+351900000012')).toEqual({ country: 'PT', national: '900000012' });
  });

  it('ne DEVINE pas un pays à partir d’un numéro nu (§17)', () => {
    // « 3312… » est un numéro français, pas un numéro français préfixé.
    expect(parsePhone('3300000012')).toEqual({ country: 'FR', national: '3300000012' });
  });

  it('rend le pays par défaut sur une valeur vide', () => {
    expect(parsePhone('')).toEqual({ country: 'FR', national: '' });
    expect(parsePhone(null)).toEqual({ country: 'FR', national: '' });
  });
});

describe('formatPhone', () => {
  it('recompose une forme E.164, sans espace ni ponctuation', () => {
    expect(formatPhone({ country: 'FR', national: '06 00 00 00 12' })).toBe('+33600000012');
    expect(formatPhone({ country: 'BE', national: '0400000012' })).toBe('+32400000012'); // secret-scan-ignore
  });

  it('GARDE le zéro là où il fait partie du numéro', () => {
    // En Italie, le retirer produit un numéro injoignable — ce qui est pire que
    // pas de numéro du tout.
    expect(formatPhone({ country: 'IT', national: '02 0000 0012' })).toBe('+390200000012'); // secret-scan-ignore
  });

  it('ne rend pas un indicatif orphelin', () => {
    // « +33 » tout seul n'est pas un numéro, et le glisser dans un message
    // laisserait croire qu'on en a donné un.
    expect(formatPhone({ country: 'FR', national: '' })).toBe('');
    expect(formatPhone({ country: 'FR', national: '   ' })).toBe('');
  });

  it('fait l’aller-retour sans rien perdre', () => {
    for (const stored of ['+33600000012', '+377900000012', '+39020000012']) {
      expect(formatPhone(parsePhone(stored))).toBe(stored);
    }
  });
});
