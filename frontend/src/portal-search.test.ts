// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

import { describe, expect, it } from 'vitest';
import {
  bieniciSearchUrl,
  leboncoinSearchUrl,
  portalMissesCity,
  selogerSearchUrl,
} from './portal-search.js';
import type { FilterConfig } from './types.js';

const NICE: FilterConfig = { cities: ['nice'], minPrice: 250, maxPrice: 700, minArea: 20 };

function query(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('leboncoinSearchUrl', () => {
  it('pose catégorie location, ville, loyer et surface', () => {
    const url = leboncoinSearchUrl(NICE);
    expect(url.startsWith('https://www.leboncoin.fr/recherche?')).toBe(true);
    const params = query(url);
    expect(params.get('category')).toBe('10');
    expect(params.get('locations')).toBe('Nice_06000__43.70313_7.26608_6000');
    expect(params.get('price')).toBe('250-700');
    expect(params.get('square')).toBe('20-max');
  });

  it('laisse la borne basse ouverte sans loyer minimum', () => {
    const params = query(leboncoinSearchUrl({ cities: ['nice'], maxPrice: 700, minArea: 0 }));
    expect(params.get('price')).toBe('min-700');
    expect(params.has('square')).toBe(false);
  });

  it('reconnaît une commune écrite avec tirets ou accents, et les particuliers', () => {
    const params = query(
      leboncoinSearchUrl({
        cities: ['nice', 'Saint-Laurent-du-Var'],
        maxPrice: 800,
        minArea: 15,
        landlordFilter: 'private',
      }),
    );
    expect(params.get('locations')).toBe(
      'Nice_06000__43.70313_7.26608_6000,Saint-Laurent-du-Var_06700__43.6734_7.1904_3000',
    );
    expect(params.get('owner_type')).toBe('private');
  });

  it('omet le lieu plutôt que d’en inventer un', () => {
    const criteria: FilterConfig = { cities: ['tende'], maxPrice: 600, minArea: 20 };
    expect(query(leboncoinSearchUrl(criteria)).has('locations')).toBe(false);
    expect(portalMissesCity('leboncoin', criteria)).toBe(true);
    expect(portalMissesCity('leboncoin', NICE)).toBe(false);
  });
});

describe('selogerSearchUrl', () => {
  it('pose location, identifiant de Nice, loyer et surface', () => {
    const url = selogerSearchUrl(NICE);
    expect(url.startsWith('https://www.seloger.com/classified-search?')).toBe(true);
    const params = query(url);
    expect(params.get('distributionTypes')).toBe('Rent');
    expect(params.get('locations')).toBe('AD08FR2038');
    expect(params.get('priceMin')).toBe('250');
    expect(params.get('priceMax')).toBe('700');
    expect(params.get('spaceMin')).toBe('20');
  });

  it('signale une commune sans identifiant connu', () => {
    expect(
      portalMissesCity('seloger', { cities: ['cagnes-sur-mer'], maxPrice: 700, minArea: 20 }),
    ).toBe(true);
    expect(portalMissesCity('seloger', NICE)).toBe(false);
  });
});

describe('bieniciSearchUrl', () => {
  it('met la ville dans le chemin et les bornes en paramètres', () => {
    expect(bieniciSearchUrl(NICE)).toBe(
      'https://www.bienici.com/recherche/location/nice-06000?prix-min=250&prix-max=700&surface-min=20',
    );
  });

  it('traduit le meublé', () => {
    const url = bieniciSearchUrl({ ...NICE, furnishedFilter: 'furnished' });
    expect(query(url).get('meuble')).toBe('oui');
  });

  it('ne garde qu’une commune, et le dit', () => {
    const criteria: FilterConfig = {
      cities: ['nice', 'cagnes-sur-mer'],
      maxPrice: 700,
      minArea: 0,
    };
    expect(bieniciSearchUrl(criteria)).toBe(
      'https://www.bienici.com/recherche/location/nice-06000?prix-max=700',
    );
    expect(portalMissesCity('bienici', criteria)).toBe(true);
    expect(portalMissesCity('bienici', NICE)).toBe(false);
  });
});
