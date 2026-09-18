import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDetail, parseListPage } from './parser.js';

const PAGE = readFileSync(
  fileURLToPath(
    new URL('../../../../../tests/fixtures/votre-agence-immo/location.html', import.meta.url),
  ),
  'utf8',
);

describe('parseListPage (Votre Agence Immo)', () => {
  const { listings, warnings } = parseListPage(PAGE);

  /**
   * LE SITEMAP MÊLE VENTES ET LOCATIONS sans rien pour les départager : s'y
   * fier aurait fait entrer des villas à 1,25 M€ dans une base de locations.
   * C'est la classe de l'article qui tranche.
   */
  it('n’garde que les locations', () => {
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.sourceRef)).toEqual([
      'nice-exemple-3-pieces',
      'nice-exemple-studio-meuble',
    ]);
    expect(warnings).toEqual([]);
  });

  /**
   * Le site réimporte son stock chaque nuit : même bien, même permalien,
   * `post-<id>` neuf. Sur le numéro d'article, un studio a fabriqué neuf
   * annonces en huit jours.
   */
  it('garde la même référence quand l’article est recréé', () => {
    const republie = PAGE.replace(/100002/g, '446197');
    const apres = parseListPage(republie);
    expect(apres.listings.map((l) => l.sourceRef)).toEqual(listings.map((l) => l.sourceRef));
  });

  /** Sans permalien exploitable, le numéro d'article reste un repli. */
  it('se rabat sur le numéro d’article si le lien est illisible', () => {
    const casse = PAGE.replace(
      /https:\/\/votre-agence-immo\.fr\/biens\/nice-exemple-3-pieces\//g,
      'pas-une-url',
    );
    expect(parseListPage(casse).listings[0]?.sourceRef).toBe('100001');
  });

  it('lit surface, pièces, type et loyer mensuel', () => {
    const l = listings.find((x) => x.sourceRef === 'nice-exemple-3-pieces');
    expect(l?.areaText).toBe('55.86 m²');
    expect(l?.roomsText).toBe('3 pièces');
    expect(l?.propertyTypeText).toMatch(/appartement/i);
    expect(l?.priceText).toBe('970 € /mois');
    expect(l?.sourceUrl).toContain('/biens/nice-exemple-3-pieces/');
  });

  it('reconnaît un studio et sa photo', () => {
    const l = listings.find((x) => x.sourceRef === 'nice-exemple-studio-meuble');
    expect(l?.propertyTypeText).toMatch(/studio/i);
    expect(l?.imageUrls?.[0]).toContain('media.apimo.pro');
  });

  /** §61 : une page qui ne rend plus rien signale un gabarit changé. */
  it('signale une page devenue muette', () => {
    const vide = parseListPage('<html><body><p>rien</p></body></html>');
    expect(vide.listings).toEqual([]);
    expect(vide.warnings).toHaveLength(1);
  });
});

const FICHE = readFileSync(
  fileURLToPath(
    new URL('../../../../../tests/fixtures/votre-agence-immo/detail.html', import.meta.url),
  ),
  'utf8',
);

describe('parseDetail (Votre Agence Immo)', () => {
  it('lit le texte ENTIER du corps, pas la meta coupée à 160 caractères', () => {
    const description = parseDetail(FICHE)?.description ?? '';
    expect(description.length).toBeGreaterThan(600);
    expect(description).toContain('73 Boulevard Virgile Barel');
    expect(description).toContain('Ce bien est donc toujours disponible.');
    // Les paragraphes du texte restent séparés.
    expect(description).toContain("charges (eau froide inclus).\nL'appartement");
  });

  it('se rabat sur la meta description si le paragraphe manque', () => {
    const html =
      '<html><head><meta name="description" content="Appartement situé au 73 Boulevard Exemple." /></head></html>';
    expect(parseDetail(html)?.description).toContain('73 Boulevard Exemple');
  });

  it('ne conclut rien d’une page sans description (§17)', () => {
    expect(parseDetail('<html><head></head></html>')).toBeNull();
  });
});
