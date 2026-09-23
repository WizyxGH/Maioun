/**
 * Tichadou : le tableau JavaScript de la page de résultats.
 *
 * La fixture est la page réelle du 2026-09-23, réduite à son tableau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDetailPage, parseListPage } from './parser.js';

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

const FICHE = readFileSync(
  fileURLToPath(new URL('../../../../../tests/fixtures/tichadou/fiche.html', import.meta.url)),
  'utf8',
);

describe('parseDetailPage (Tichadou)', () => {
  it('lit les montants du tableau, dépôt de garantie compris', () => {
    const detail = parseDetailPage(FICHE);
    expect(detail?.chargesText).toBe('95 €');
    expect(detail?.feesText).toBe('385.86 €');
    // LE DÉPÔT, QUE LA DESCRIPTION TAIT : il n'existe que dans le tableau.
    expect(detail?.depositText).toBe('490 €');
    // Le site écrit « 29m² », sans espace : on rend ce qu'il écrit.
    expect(detail?.areaText).toBe('29m²');
  });

  /**
   * LA LISTE NE DONNE QU'UNE PHOTO, en version « moyennes ». La fiche porte la
   * galerie entière, deux fois — vignettes de 90 px et pleine taille — et
   * c'est la pleine taille qu'on garde.
   */
  it('garde la galerie en pleine taille, sans les vignettes', () => {
    const photos = parseDetailPage(FICHE)?.imageUrls ?? [];
    expect(photos).toHaveLength(5);
    expect(photos.every((url) => url.startsWith('https://www.tichadou.fr/'))).toBe(true);
    expect(photos.some((url) => url.includes('/vignettes/'))).toBe(false);
    expect(photos.some((url) => url.includes('/moyennes/'))).toBe(false);
  });

  /** L'étiquette énergie est une IMAGE, et son nom porte les deux classes. */
  it('lit le DPE et le GES dans le nom de l’image', () => {
    const extra = parseDetailPage(FICHE)?.extra;
    expect(extra?.['dpe']).toBe('D');
    expect(extra?.['ges']).toBe('D');
  });

  it('relève l’étage, l’ascenseur, le balcon et le quartier', () => {
    const extra = parseDetailPage(FICHE)?.extra;
    expect(extra?.['etage']).toBe('2');
    expect(extra?.['ascenseur']).toBe('1');
    expect(extra?.['nbBalcons']).toBe('1');
    expect(extra?.['quartier']).toBe('Centre ville');
  });

  it('range les traits déclarés là où la détection les lit sans les nier', () => {
    const features = parseDetailPage(FICHE)?.extra?.['features'] ?? '';
    expect(features).toContain('cuisine');
    expect(features).toContain('chauffage');
  });

  it('ne rend rien sur une page sans tableau', () => {
    expect(parseDetailPage('<html><body>rien</body></html>')).toBeNull();
  });
});
