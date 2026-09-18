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
    const { urls, warnings } = parseListPage(liste, BASE);
    // T3 + Maison (le parking et les pages de catégorie sont écartés).
    expect(urls.map((u) => u.reference).sort()).toEqual(['GES12345678-53', 'GES99999999-10']);
    expect(warnings).toHaveLength(0);
  });

  /**
   * LA PAGE D'UNE COMMUNE SANS STOCK S'ÉLARGIT. La liste des maisons de Nice
   * n'en portait aucune à Nice, mais onze du Vaucluse, des Bouches-du-Rhône et
   * du Var, plus une à Antibes — toutes enregistrées comme niçoises.
   */
  it('écarte les fiches des autres communes et le signale', () => {
    const { urls, warnings } = parseListPage(
      readFileSync(join(FIXTURES, 'liste-elargie.html'), 'utf8'),
      'https://www.citya.com/annonces/location/maison/nice-06088',
    );
    expect(urls).toHaveLength(0);
    // Signalé, et surtout pas confondu avec une page vide.
    expect(warnings).toEqual([
      expect.stringContaining('Liste élargie hors de nice : 6 fiche(s) écartée(s)'),
    ]);
  });

  /** Antibes est dans le 06 sans être Nice : le département ne fait pas la commune. */
  it('ne retient pas une commune voisine du même département', () => {
    const { urls } = parseListPage(
      readFileSync(join(FIXTURES, 'liste-elargie.html'), 'utf8'),
      'https://www.citya.com/annonces/location/maison/nice-06088',
    );
    expect(urls.map((u) => u.citySlug)).not.toContain('antibes-06004');
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
 * COMMUNE ET CODE POSTAL DU BIEN. `cityText` valait « nice » en dur : tout ce
 * que la liste ramenait entrait à Nice, et la liste s'élargit à d'autres
 * départements. Onze fiches actives portaient Nice avec un code postal du
 * Vaucluse, des Bouches-du-Rhône ou du Var (relevé du 2026-09-18).
 */
describe('parseDetailPage — la commune vient du bien', () => {
  const HORS_NICE =
    'https://www.citya.com/annonces/location/maison/pernes-les-fontaines-84210/GES31340619-84';
  const { listing } = parseDetailPage(
    readFileSync(join(FIXTURES, 'detail-hors-nice.html'), 'utf8'),
    HORS_NICE,
    'Citya Immobilier',
  );

  it('lit la commune et le code postal publiés par la fiche', () => {
    expect(listing?.cityText).toBe('Pernes-les-Fontaines');
    expect(listing?.postalCodeText).toBe('84210');
  });

  it('se normalise dans sa vraie commune, hors des critères de Nice', () => {
    const normalized = normalizeListing(listing as NonNullable<typeof listing>, {
      sourceId: 'citya',
      nowMs: Date.parse('2026-09-18T12:00:00Z'),
    });
    expect(normalized?.city).toBe('pernes les fontaines');
    expect(normalized?.postalCode).toBe('84210');
  });

  /**
   * L'URL colle un INSEE au nom de commune à Nice (`nice-06088`) : le lire
   * comme un code postal en fabriquait un qui n'existe pas, et une occurrence
   * portait 06088.
   */
  it('ne prend pas l’INSEE de l’URL pour un code postal', () => {
    const sansAdresse = `<!DOCTYPE html><html><head>
      <title>Appartement à louer 2 pièces 45m² - Nice (06) - 900€ | Citya Immobilier</title>
      </head><body><h1>
      <span class="heading-2 block">Appartement à louer 2 pièces 45m²</span>
      <span class="ville inline-flex">&nbsp;Nice (06200)</span>
      </h1></body></html>`;
    const { listing: fallback } = parseDetailPage(
      sansAdresse,
      'https://www.citya.com/annonces/location/appartement/nice-06088/GES08470133-53',
      'Citya Immobilier',
    );
    expect(fallback?.cityText).toBe('Nice');
    expect(fallback?.postalCodeText).toBe('06200');
  });

  /** Ni fiche ni titre : le champ reste absent plutôt que deviné. */
  it('laisse la commune absente quand la fiche ne la publie pas', () => {
    const muette = `<!DOCTYPE html><html><head>
      <title>Appartement à louer 2 pièces 45m² | Citya Immobilier</title>
      </head><body><h1>Appartement à louer 2 pièces 45m²</h1></body></html>`;
    const { listing: rien } = parseDetailPage(
      muette,
      'https://www.citya.com/annonces/location/appartement/nice-06088/GES08470133-53',
      'Citya Immobilier',
    );
    expect(rien?.cityText).toBeUndefined();
    expect(rien?.postalCodeText).toBeUndefined();
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

describe('parseDetailPage — montants, DPE et agence référente', () => {
  const fiche = readFileSync(join(FIXTURES, 'detail-montants.html'), 'utf8');
  const listing = parseDetailPage(fiche, DETAIL_URL, 'Citya Immobilier').listing;

  it('lit charges, dépôt, honoraires et disponibilité sous le titre', () => {
    expect(listing?.chargesText).toBe('110 €');
    expect(listing?.depositText).toBe('944,54 €');
    expect(listing?.feesText).toBe('298,32 €');
    expect(listing?.availableAtText).toBe('Libre');
    expect(listing?.postalCodeText).toBe('06000');
  });

  it('prend la case agrandie du DPE et le numéro de l’agence, pas celui du service qualité', () => {
    expect(listing?.extra?.['dpe']).toBe('C');
    // Le bloc « (GES) » a le même gabarit : sa case agrandie est l'autre étiquette.
    expect(listing?.extra?.['ges']).toBe('C');
    expect(listing?.phoneText).toBe('0600000051');
  });

  it('va jusqu’à la fiche normalisée', () => {
    const normalized =
      listing === null
        ? null
        : normalizeListing(listing, {
            sourceId: 'citya',
            nowMs: Date.parse('2026-09-15T12:00:00Z'),
          });
    expect(normalized?.deposit).toBe(944.54);
    expect(normalized?.charges).toBe(110);
    expect(normalized?.tenantFees).toBe(298.32);
    expect(normalized?.dpe).toBe('C');
    expect(normalized?.availableAt).not.toBeNull();
    expect(normalized?.contact.phone).not.toBeNull();
  });
});
