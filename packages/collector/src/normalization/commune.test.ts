import { describe, expect, it } from 'vitest';
import {
  communeNameBefore,
  communeWithPostalCode,
  isPlausibleCommune,
  plausibleCommune,
} from './commune.js';

describe('isPlausibleCommune', () => {
  it('refuse un libellé d’action pris pour une commune', () => {
    // Le défaut mesuré : vingt-trois occurrences portaient « voir l annonce »
    // comme commune, et l'adresse affichée devenait « 06200 Voir L Annonce ».
    expect(isPlausibleCommune('Voir l’annonce')).toBe(false);
    expect(isPlausibleCommune('voir l annonce')).toBe(false);
    expect(isPlausibleCommune('En savoir plus')).toBe(false);
    expect(isPlausibleCommune('Contacter l’agence')).toBe(false);
    expect(isPlausibleCommune('Cliquez ici')).toBe(false);
    expect(isPlausibleCommune('Découvrir l’offre')).toBe(false);
  });

  it('laisse toujours passer une vraie commune, du périmètre ou non', () => {
    for (const name of [
      'Nice',
      'Cagnes-sur-Mer',
      'Saint-Laurent-du-Var',
      'Saint-André-de-la-Roche',
      'Cap-d’Ail',
      'La Trinité',
      'Drap',
      // Hors périmètre : la table sert à dire oui, jamais à dire non.
      'Antibes',
      'Menton',
      'Villeneuve-lès-Avignon',
    ]) {
      expect(isPlausibleCommune(name), name).toBe(true);
    }
  });

  it('refuse une position plutôt qu’une commune', () => {
    expect(isPlausibleCommune('à 17 km de Nice')).toBe(false);
    expect(isPlausibleCommune('DRAP / 12KM DE NICE')).toBe(false);
    expect(isPlausibleCommune('proche de Nice')).toBe(false);
  });

  it('refuse ce qui ne nomme rien', () => {
    expect(isPlausibleCommune(null)).toBe(false);
    expect(isPlausibleCommune('')).toBe(false);
    expect(isPlausibleCommune('06340')).toBe(false);
    expect(isPlausibleCommune('studio meublé avec terrasse et vue mer')).toBe(false);
  });
});

describe('plausibleCommune', () => {
  it('rend la forme comparable d’une commune, et rien pour le reste', () => {
    expect(plausibleCommune('Cagnes-sur-Mer')).toBe('cagnes sur mer');
    expect(plausibleCommune('Voir l’annonce')).toBeNull();
  });
});

describe('communeWithPostalCode', () => {
  it('lit la commune écrite avant le code postal, malgré le bouton qui suit', () => {
    expect(communeWithPostalCode('590 €cc 1 pièce • 12 m² Nice, 06100 Voir l’annonce →')).toEqual({
      city: 'Nice',
      postalCode: '06100',
    });
    expect(communeWithPostalCode('1 pièce • 20 m² Saint-Laurent-du-Var, 06700')).toEqual({
      city: 'Saint-Laurent-du-Var',
      postalCode: '06700',
    });
  });

  it('ne rend rien quand ce qui précède la virgule n’est pas un nom', () => {
    expect(communeWithPostalCode('790 € charges comprises, 06200 Nice')).toBeUndefined();
    expect(communeWithPostalCode('06200 Nice')).toBeUndefined();
  });
});

describe('communeNameBefore', () => {
  it('remonte mot à mot et s’arrête au premier mot commun', () => {
    const texte = '790 € / mois charges comprises Villeneuve Loubet 06270';
    expect(communeNameBefore(texte, texte.indexOf('06270'))).toBe('Villeneuve Loubet');
  });

  it('ne rend rien quand le mot retenu ne serait pas une commune', () => {
    // Le libellé porte une majuscule comme un nom propre : seule la table des
    // communes le départage.
    const texte = '590 €cc Voir 06000';
    expect(communeNameBefore(texte, texte.indexOf('06000'))).toBeUndefined();
  });
});
