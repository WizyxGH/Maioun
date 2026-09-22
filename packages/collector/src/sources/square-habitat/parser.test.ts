/**
 * Square Habitat : la page de liste porte TOUT, et le site élargit en silence.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { geoByReference, parseListPage } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(
  resolve(here, '../../../../../tests/fixtures/square-habitat/nice-location.html'),
  'utf8',
);
const PAGE =
  'https://www.squarehabitat.fr/annonces/location/bien/appartement/immobilier/provence-alpes-cote-d-azur/alpes-maritimes/nice-06000';

/**
 * Le périmètre, jugé SUR LE NOM : Nice a quatre codes postaux — 06000, 06100,
 * 06200, 06300 — et le périmètre du projet n'en nomme qu'un.
 */
const niceOnly = (city: string): boolean => /nice/i.test(city);

describe('parseListPage (Square Habitat)', () => {
  const { listings, warnings } = parseListPage(HTML, PAGE, 'Square Habitat', niceOnly);

  /**
   * LE SITE ÉLARGIT SILENCIEUSEMENT : la page d'une commune sans stock rend les
   * annonces des communes voisines, sans le dire autrement qu'en petit. Le
   * titre de la page ne prouve donc rien — c'est la commune de chaque carte qui
   * décide.
   */
  it('écarte les communes hors périmètre que la page a glissées', () => {
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.postalCodeText).sort()).toEqual(['06000', '06300']);
    expect(warnings.join(' ')).toContain('hors périmètre');
  });

  it('lit prix, pièces, surface et commune sur la carte', () => {
    const deuxPieces = listings.find((l) => l.sourceRef.startsWith('3327d852'));
    expect(deuxPieces?.priceText).toBe('849 €');
    expect(deuxPieces?.areaText).toBe('41.8 m²');
    expect(deuxPieces?.roomsText).toContain('2 pièces');
    expect(deuxPieces?.cityText).toBe('NICE (06000)');
  });

  /** Le loyer est annoncé charges comprises : le taire fausserait le budget. */
  it('retient la mention « cc » qui accompagne le prix', () => {
    expect(listings[0]?.chargesText).toBe('cc');
  });

  it('prend la description entière, sans visiter la fiche', () => {
    const studio = listings.find((l) => l.sourceRef.startsWith('fb625611'));
    expect(studio?.description).toContain('Rue Auguste Gal');
  });

  /**
   * LES COORDONNÉES VALENT TRENTE POINTS AU DÉDOUBLONNAGE, et évitent un appel
   * de géocodage. C'est la meilleure donnée de la page.
   */
  it('reprend l’URL canonique et les coordonnées du JSON-LD', () => {
    const deuxPieces = listings.find((l) => l.sourceRef.startsWith('3327d852'));
    expect(deuxPieces?.sourceUrl).toContain('/annonces/biens/location/appartement/nice/3327d852');
    expect(deuxPieces?.latitude).toBeCloseTo(43.7221, 3);
    expect(deuxPieces?.longitude).toBeCloseTo(7.2859, 3);
  });

  it('relie chaque bloc JSON-LD à sa carte par la queue de l’URL', () => {
    const geos = geoByReference(HTML);
    expect(geos.size).toBe(3);
    expect(geos.get('fb625611-159c-4bcd-a335-4f84cf7f787d')?.postalCode).toBe('06300');
  });

  /** Les attributs `_ngcontent-*` changent à chaque déploiement : ne pas s'y fier. */
  it('ne dépend d’aucun attribut Angular engendré', () => {
    const sansNgcontent = HTML.replace(/_ngcontent-[a-z0-9-]+/g, '_ngcontent-autre');
    expect(parseListPage(sansNgcontent, PAGE, 'Square Habitat', niceOnly).listings).toHaveLength(2);
  });
});
