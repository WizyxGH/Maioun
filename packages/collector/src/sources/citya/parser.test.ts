import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetailPage, parseListingUrl, parseListPage } from './parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/citya');
const BASE = 'https://www.citya.com/annonces/location/appartement/nice-06088';
const DETAIL_URL = 'https://www.citya.com/annonces/location/appartement/nice-06088/GES12345678-53';

const liste = readFileSync(join(FIXTURES, 'liste.html'), 'utf8');
const detail = readFileSync(join(FIXTURES, 'detail.html'), 'utf8');

describe('parseListingUrl', () => {
  it('décompose une fiche et rejette les pages de catégorie', () => {
    const fiche = parseListingUrl(DETAIL_URL, BASE);
    expect(fiche?.reference).toBe('GES12345678-53');
    expect(fiche?.typeSlug).toBe('appartement');
    expect(fiche?.citySlug).toBe('nice-06088');

    // Page de catégorie (pas de réf) ou paramètre → non.
    expect(parseListingUrl('/annonces/location/appartement/nice-06088', BASE)).toBeNull();
    expect(
      parseListingUrl('/annonces/location/appartement/nice-06088?carte=true', BASE),
    ).toBeNull();
  });
});

describe('parseListPage', () => {
  it('extrait les fiches résidentielles, dédoublonnées, sans parking', () => {
    const { urls } = parseListPage(liste, BASE);
    // T3 + Maison (le parking et les pages de catégorie sont écartés).
    expect(urls.map((u) => u.reference).sort()).toEqual(['GES12345678-53', 'GES99999999-10']);
  });
});

describe('parseDetailPage', () => {
  const { listing, warnings } = parseDetailPage(detail, DETAIL_URL, 'Citya Immobilier');

  it('extrait prix, surface, pièces, CP et photos depuis le JSON-LD', () => {
    expect(warnings).toHaveLength(0);
    expect(listing?.sourceRef).toBe('GES12345678-53');
    expect(listing?.priceText).toBe('890 €');
    expect(listing?.areaText).toBe('54.25m²');
    expect(listing?.roomsText).toBe('3 pièces');
    expect(listing?.postalCodeText).toBe('06100');
    // Seules les vraies photos (/biens/) sont retenues ; l'asset de marque
    // (/assets/…/vesta-….webp) est écarté — sinon envoyé à tort en alerte.
    expect(listing?.imageUrls).toHaveLength(2);
    expect(listing?.imageUrls?.every((u) => u.includes('/biens/'))).toBe(true);
  });

  it('se normalise dans les critères de Nice', () => {
    const normalized = normalizeListing(listing as NonNullable<typeof listing>, {
      sourceId: 'citya',
      nowMs: Date.parse('2026-08-19T12:00:00Z'),
    });
    expect(normalized).not.toBeNull();
    if (normalized === null) return;
    expect(normalized.price).toBe(890);
    expect(normalized.area).toBe(54.25);
    expect(normalized.rooms).toBe(3);
    expect(normalized.city).toBe('nice');
    expect(normalized.postalCode).toBe('06100');
    expect(normalized.propertyType).toBe('apartment');
  });
});

/**
 * UNE FICHE CITYA SE TERMINE PAR SES VOISINES. Le bloc « annonces similaires »
 * range ses vignettes dans le même dossier que les vraies photos — parfois
 * celui d'une AUTRE agence. La moitié des photos enregistrées appartenaient à
 * d'autres logements : une même vignette se retrouvait dans neuf annonces, et
 * chacune en affichait exactement dix, plafond atteint avant d'avoir fini les
 * siennes.
 */
describe('photos : les voisines ne sont pas les siennes', () => {
  const page = (ref: string): string => `<!DOCTYPE html><html><body>
    <h1>Appartement à louer 3 pièces 64.4 m² - Nice (06)</h1>
    <div class="prix">1 300 €</div>
    <div class="carousel">
      <img src="/media/images/agences/biens/149/location/image00001.webp" />
      <img src="/media/images/agences/biens/149/location/image00002.webp" />
    </div>
    <section class="similaires">
      <article data-itemId="${ref}">
        <img src="/media/images/agences/biens/148/location/voisine.webp" />
      </article>
    </section>
  </body></html>`;

  const URL = 'https://www.citya.com/annonces/location/appartement/nice-06088/GES84760006-53';

  it('ne garde que les photos du logement affiché', () => {
    const { listing } = parseDetailPage(page('GES84870328-53'), URL, 'Citya Immobilier');
    expect(listing?.imageUrls).toEqual([
      'https://www.citya.com/media/images/agences/biens/149/location/image00001.webp',
      'https://www.citya.com/media/images/agences/biens/149/location/image00002.webp',
    ]);
  });

  /**
   * Le critère est la RÉFÉRENCE, pas la présence de l'attribut : si la page
   * enveloppait un jour ses propres photos dans un bloc marqué, elles doivent
   * rester.
   */
  it('garde une photo marquée de SA propre référence', () => {
    const { listing } = parseDetailPage(page('GES84760006-53'), URL, 'Citya Immobilier');
    expect(listing?.imageUrls).toHaveLength(3);
  });
});
