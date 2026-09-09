import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseListingUrl, parseSearchPage } from './parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/century21');
const PAGE_URL = 'https://www.century21.fr/annonces/location-appartement/v-nice/';

const nominal = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');
const fiche = readFileSync(join(FIXTURES, 'fiche-description.html'), 'utf8');

describe('parseListingUrl', () => {
  it('décompose une URL de fiche', () => {
    const parsed = parseListingUrl('https://www.century21.fr/trouver_logement/detail/16000000001/');
    expect(parsed?.reference).toBe('16000000001');
  });

  it('rejette les autres pages', () => {
    expect(parseListingUrl(PAGE_URL)).toBeNull();
  });
});

describe('parseSearchPage — fixture nominale', () => {
  const page = parseSearchPage(nominal, PAGE_URL);

  it('extrait les trois cartes sans warning ni pagination', () => {
    expect(page.listings).toHaveLength(3);
    expect(page.warnings).toHaveLength(0);
    expect(page.hasNextPage).toBe(false);
  });

  it('extrait la carte complète (prix, surface, pièces, réf agence, ville)', () => {
    const f3 = page.listings.find((l) => l.sourceRef === '16000000001');
    expect(f3?.priceText).toContain('3 000 € par mois charges comprises');
    expect(f3?.areaText).toBe('78,27 m2');
    expect(f3?.roomsText).toBe('3 pièces');
    expect(f3?.cityText).toBe('NICE');
    expect(f3?.extra?.['agencyRef']).toBe('90001');
  });

  it('garde les photos écrites en chemin relatif, et laisse l’habillage', () => {
    // Century 21 écrit ses photos « /imagesBien/s3/… ». On n'acceptait que les
    // adresses commençant par `http` : TOUTES les fiches arrivaient sans photo.
    const bare = page.listings.find((l) => l.sourceRef === '16000000003');
    expect(bare?.imageUrls).toEqual([
      'https://www.century21.fr/imagesBien/s3/202/579/fixture-c21-photo-3.jpg',
    ]);
  });

  it('omet les champs absents (§17)', () => {
    const bare = page.listings.find((l) => l.sourceRef === '16000000003');
    expect(bare?.priceText).toBeUndefined();
    expect(bare?.areaText).toBeUndefined();
  });
});

describe('chaîne complète avec la normalisation', () => {
  const NOW = Date.parse('2026-08-15T12:00:00.000Z');
  const page = parseSearchPage(nominal, PAGE_URL);

  it('produit un studio meublé charges comprises dans les critères', () => {
    const studio = page.listings.find((l) => l.sourceRef === '16000000002');
    if (studio === undefined) throw new Error('studio absent');
    const normalized = normalizeListing(studio, { sourceId: 'century21', nowMs: NOW });
    expect(normalized?.price).toBe(660);
    expect(normalized?.chargesIncluded).toBe(true);
    expect(normalized?.area).toBe(18);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.contact.reference).not.toBeNull();
  });
});

describe('parseDetail — la description entière, lue sur la fiche', () => {
  it('rend un texte bien plus long que le fragment de la carte', () => {
    const detail = parseDetail(fiche);
    expect(detail?.description).toBeDefined();
    expect(detail?.description?.length).toBeGreaterThan(300);
  });

  it('NE MÊLE PAS la traduction anglaise à la description française', () => {
    // Le bloc porte les deux versions dans deux `span` montrés à tour de rôle.
    // Les lire ensemble donnait un texte bilingue, deux fois trop long.
    const description = parseDetail(fiche)?.description ?? '';
    expect(description).toContain("L'appartement se compose");
    expect(description).not.toContain('bedroom apartment');
    expect(description).not.toContain('without delay');
  });

  it('garde l’adresse de rue que la fiche met en tête', () => {
    // C'est elle qui permet de géocoder le bien (§20) et de le rapprocher de
    // ses jumelles (§14) — la carte ne la donnait jamais.
    expect(parseDetail(fiche)?.description).toContain('23 boulevard saint Roch');
  });

  it('sépare les lignes que le site marque par un <br>', () => {
    const description = parseDetail(fiche)?.description ?? '';
    expect(description).toContain('\n');
    // Sans rupture, « saint Roch » et « Appartement » se collaient en un mot
    // introuvable, et l'extraction d'adresse butait dessus.
    expect(description).not.toContain('RochAppartement');
  });

  it('rend null quand la fiche ne porte pas de bloc description (§17)', () => {
    expect(parseDetail('<html><body><p>rien</p></body></html>')).toBeNull();
    expect(parseDetail('<section class="c-the-property-detail-description"></section>')).toBeNull();
  });
});
