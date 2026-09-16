import { describe, expect, it } from 'vitest';
import { forgetListing, replaceListing } from './listing-store.js';
import { MOCK_LISTINGS } from './api/mock-data.js';
import type { ListingView } from './types.js';

const [un, deux, trois] = MOCK_LISTINGS as readonly ListingView[];
const liste = [un!, deux!, trois!];

describe('la liste chargée face à la fiche qui arrive', () => {
  it('remplace la version allégée à sa place', () => {
    const complete = { ...deux!, partial: false };
    const next = replaceListing(liste, deux!.id, complete);
    expect(next.map((one) => one.id)).toEqual(liste.map((one) => one.id));
    expect(next[1]?.partial).toBe(false);
  });

  it('ajoute la fiche ouverte par son adresse, absente de la liste', () => {
    const next = replaceListing([un!], deux!.id, deux!);
    expect(next.map((one) => one.id)).toEqual([un!.id, deux!.id]);
  });

  /**
   * Une fusion change l'identifiant du groupe : l'API sert la fiche sous le
   * nouveau nom. L'ancienne entrée cède sa place, sans laisser de doublon.
   */
  it('ne garde qu’une entrée quand l’identifiant a changé', () => {
    const next = replaceListing(liste, un!.id, { ...deux!, partial: false });
    expect(next.map((one) => one.id)).toEqual([deux!.id, trois!.id]);
    expect(next[0]?.partial).toBe(false);
  });

  it('reporte ce que l’écran vient d’appliquer et que la base ignore', () => {
    const avant = { ...un!, favorite: true };
    const next = replaceListing([avant], un!.id, { ...un!, favorite: false }, (previous) => ({
      favorite: previous?.favorite,
    }));
    expect(next[0]?.favorite).toBe(true);
  });

  it('retire une annonce que l’API ne sert plus', () => {
    expect(forgetListing(liste, deux!.id).map((one) => one.id)).toEqual([un!.id, trois!.id]);
  });
});
