/**
 * Tichadou : le tableau JavaScript de la page de résultats.
 *
 * La fixture est la page réelle du 2026-09-23, réduite à son tableau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseListPage } from './parser.js';

const HTML = readFileSync(
  fileURLToPath(new URL('../../../../../tests/fixtures/tichadou/locations.html', import.meta.url)),
  'utf8',
);

describe('parseListPage (Tichadou)', () => {
  it('relève les quatre locations du tableau', () => {
    const { listings, warnings } = parseListPage(HTML);
    expect(listings).toHaveLength(4);
    expect(warnings).toEqual([]);
  });

  it('lit le titre, le loyer, la surface et les pièces', () => {
    const studio = parseListPage(HTML).listings.find((one) =>
      one.sourceRef.startsWith('GES07300680'),
    );
    expect(studio?.priceText).toContain('585');
    expect(studio?.areaText).toBe('29');
    expect(studio?.roomsText).toBe('1');
    expect(studio?.propertyTypeText).toBe('Appartement');
    expect(studio?.cityText).toBe('Nice');
  });

  /**
   * LA DESCRIPTION EST LE TRÉSOR DE CETTE SOURCE : elle donne le loyer charges
   * comprises, la provision, les honoraires au mètre carré et la part d'état
   * des lieux — les deux montants que plafonne la loi.
   */
  it('garde la description entière, honoraires compris', () => {
    const studio = parseListPage(HTML).listings.find((one) =>
      one.sourceRef.startsWith('GES07300680'),
    );
    expect(studio?.description).toContain('honoraires charge locataire');
    expect(studio?.description).toContain('état des lieux');
    // Les entités HTML sont décodées : pas de « &eacute; » à l'écran.
    expect(studio?.description).not.toContain('&');
  });

  it('construit une adresse de fiche absolue', () => {
    const [premiere] = parseListPage(HTML).listings;
    expect(premiere?.sourceUrl).toMatch(/^https:\/\/www\.tichadou\.fr\/location-/);
  });

  it('ne rend rien, et le dit, sur une page sans tableau', () => {
    const { listings, warnings } = parseListPage('<html><body>rien ici</body></html>');
    expect(listings).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
