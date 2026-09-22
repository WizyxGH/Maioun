/**
 * lesiteimmo.com : le sitemap ment par omission, la page dit tout.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { announcedTotal, listedItems, parseListPage } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(
  resolve(here, '../../../../../tests/fixtures/lesiteimmo/nice-louer-appartement.html'),
  'utf8',
);

const niceOnly = (city: string): boolean => /nice/i.test(city);

describe('parseListPage (lesiteimmo)', () => {
  const { listings, warnings, total } = parseListPage(HTML, niceOnly);

  it('lit les annonces du JSON-LD, sans visiter aucune fiche', () => {
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.sourceRef).sort()).toEqual(['33825046', '33852325']);
  });

  it('reprend loyer, surface, pièces et commune', () => {
    const studio = listings.find((l) => l.sourceRef === '33825046');
    expect(studio?.priceText).toBe('720 €');
    expect(studio?.areaText).toBe('24 m²');
    expect(studio?.roomsText).toBe('1 pièces');
    expect(studio?.cityText).toBe('Nice');
    expect(studio?.postalCodeText).toBe('06000');
  });

  /** Elle manque aux deux tiers de nos fiches, et le tri « récentes » la préfère. */
  it('reprend la DATE DE PUBLICATION, que peu de sources donnent', () => {
    expect(listings.find((l) => l.sourceRef === '33825046')?.publishedAtText).toBe('2026-09-15');
  });

  /**
   * LE NOM DE L'AGENCE rattache l'annonce à la source d'origine quand nous la
   * collectons déjà, et nomme celles qui nous manquent.
   */
  it('reprend l’agence qui publie', () => {
    expect(listings.find((l) => l.sourceRef === '33852325')?.agencyName).toBe(
      'Cabinet Fictif Immobilier',
    );
  });

  it('prend la description entière', () => {
    const studio = listings.find((l) => l.sourceRef === '33825046');
    expect(studio?.description).toContain('cuisine aménagée');
  });

  it('écarte les communes hors périmètre et le dit', () => {
    expect(listings.every((l) => l.cityText === 'Nice')).toBe(true);
    expect(warnings.join(' ')).toContain('hors périmètre');
  });

  /** Le total annoncé dit combien de pages restent à lire. */
  it('lit le total annoncé par la page', () => {
    expect(total).toBe(255);
    expect(announcedTotal('<p>1 234 annonces</p>')).toBe(1234);
    expect(announcedTotal('<p>rien ici</p>')).toBeNull();
  });

  /**
   * LE CHEMIN DU JSON-LD N'EST PAS EN DUR : le portail a déjà déplacé sa liste
   * sous `mainEntity`, et un chemin fixe se serait tu sans erreur.
   */
  it('retrouve les annonces quelle que soit la profondeur du bloc', () => {
    const enfoui = HTML.replace('"mainEntity"', '"autreNiveau":{"encore":1},"mainEntity"');
    expect(listedItems(enfoui)).toHaveLength(3);
  });

  it('ne tombe pas sur un bloc JSON illisible', () => {
    const casse = `${HTML}<script type="application/ld+json">{ pas du json </script>`;
    expect(parseListPage(casse, niceOnly).listings).toHaveLength(2);
  });
});
