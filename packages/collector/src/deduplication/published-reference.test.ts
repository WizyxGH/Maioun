import { describe, expect, it } from 'vitest';
import { referencesInText } from './published-reference.js';

describe('référence écrite dans la description', () => {
  it('lit la référence que l’agence annonce', () => {
    expect(referencesInText('Honoraires 220 €\nRéférence de l’annonce : 0603744')).toEqual([
      '0603744',
    ]);
    expect(referencesInText('Réf. AN006144 - IMODIRECT vous présente')).toEqual(['an006144']);
    expect(referencesInText('Référence : 346706 - Loyer : 1550 €')).toEqual(['346706']);
  });

  it('ignore le millésime d’un diagnostic', () => {
    const dpe = 'prix moyens des énergies indexés sur les années de référence 2021';
    expect(referencesInText(dpe)).toEqual([]);
  });

  it('ignore « réf » au début d’un mot', () => {
    expect(referencesInText('Cuisine équipée : RÉFRIGÉRATEUR 300 litres')).toEqual([]);
    expect(referencesInText('Deux pièces refait à neuf en 2024')).toEqual([]);
  });

  it('exige un identifiant, pas un mot', () => {
    expect(referencesInText('Réf : disponible immédiatement')).toEqual([]);
    expect(referencesInText('Réf : 12')).toEqual([]);
  });

  it('rend le même mot pour deux écritures du même numéro', () => {
    expect(referencesInText('Réf L00093_108_')).toEqual(referencesInText('Réf. L00093-108'));
  });

  it('ne rend rien sans description', () => {
    expect(referencesInText(null)).toEqual([]);
  });
});
