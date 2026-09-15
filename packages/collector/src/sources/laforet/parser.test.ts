/**
 * Tests du parser Laforêt (§50).
 *
 * `HTML fixture → parser → RawListing → normalisation → NormalizedListing`.
 * Aucun accès réseau : la fixture est locale et versionnée (§59).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  agencyNameFromSlug,
  extractCity,
  parseDetailPage,
  parseDpeSvg,
  parseListingUrl,
  parseSearchPage,
} from './parser.js';
import { normalizeAll } from '../../normalization/normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, '../../../../../tests/fixtures/laforet');

const readFixture = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');

const PAGE_URL = 'https://www.laforet.com/ville/location-appartement-nice-06000';

describe('parseListingUrl', () => {
  it('décompose une URL d’annonce', () => {
    const parsed = parseListingUrl(
      'https://www.laforet.com/agence-immobiliere/nice-gambetta/louer/nice/appartement-3-pieces-52862967',
    );
    expect(parsed).toEqual({
      agencySlug: 'nice-gambetta',
      citySlug: 'nice',
      typeSlug: 'appartement-3-pieces',
      reference: '52862967',
      canonicalUrl:
        'https://www.laforet.com/agence-immobiliere/nice-gambetta/louer/nice/appartement-3-pieces-52862967',
    });
  });

  it('supprime le fragment pour produire une URL canonique', () => {
    const withFragment = parseListingUrl(
      'https://www.laforet.com/agence-immobiliere/nice-port/louer/nice/appartement-1-piece-40000003#section-video',
    );
    expect(withFragment?.canonicalUrl).toBe(
      'https://www.laforet.com/agence-immobiliere/nice-port/louer/nice/appartement-1-piece-40000003',
    );
  });

  it('rejette ce qui n’est pas une fiche d’annonce', () => {
    expect(parseListingUrl('https://www.laforet.com/agence-immobiliere/nice-centre')).toBeNull();
    expect(
      parseListingUrl('https://www.laforet.com/agence-immobiliere/nice-centre/louer'),
    ).toBeNull();
    expect(parseListingUrl('https://exemple.fr/louer/nice/appartement-1')).toBeNull();
  });
});

describe('agencyNameFromSlug', () => {
  it('reconstitue un nom d’agence lisible', () => {
    expect(agencyNameFromSlug('nice-gambetta')).toBe('Laforêt Nice Gambetta');
    expect(agencyNameFromSlug('cagnes-sur-mer')).toBe('Laforêt Cagnes Sur Mer');
  });
});

describe('extractCity', () => {
  it('sépare la ville du code postal', () => {
    expect(extractCity('NICE (06000)')).toEqual({ city: 'NICE', postalCode: '06000' });
    expect(extractCity('Cagnes-sur-Mer (06800)')).toEqual({
      city: 'Cagnes-sur-Mer',
      postalCode: '06800',
    });
  });

  it('n’absorbe pas le mot qui précède la ville', () => {
    // Non-régression : « 690 €/mois NICE (06000) » a capturé « mois NICE »
    // tant que le motif n'exigeait pas une majuscule initiale.
    expect(extractCity('690 €/mois NICE (06000)').city).toBe('NICE');
  });

  it('rend la ville à null mais garde le code postal si la ville manque', () => {
    expect(extractCity('(06000)')).toEqual({ city: null, postalCode: '06000' });
  });
});

describe('parseSearchPage — page nominale', () => {
  const page = parseSearchPage(readFixture('nice-page1.html'), PAGE_URL);

  it('extrait toutes les annonces sans doublon', () => {
    // 5 annonces, malgré le second lien vers l'annonce 40000002 (#section-video)
    // et les deux liens d'agence qui ne sont pas des annonces.
    expect(page.listings).toHaveLength(5);
    expect(page.listings.map((listing) => listing.sourceRef).sort()).toEqual([
      '40000001',
      '40000002',
      '40000003',
      '40000004',
      '40000005',
    ]);
  });

  it('extrait correctement les champs d’une annonce', () => {
    const listing = page.listings.find((item) => item.sourceRef === '40000001');
    expect(listing).toBeDefined();
    expect(listing?.priceText).toMatch(/690/);
    expect(listing?.areaText).toMatch(/34/);
    expect(listing?.cityText).toBe('NICE');
    expect(listing?.postalCodeText).toBe('06000');
    expect(listing?.propertyTypeText).toBe('Appartement');
    expect(listing?.agencyName).toBe('Laforêt Nice Centre');
  });

  it('détecte la page suivante', () => {
    expect(page.hasNextPage).toBe(true);
  });

  it('ne remonte aucune anomalie sur une page saine', () => {
    expect(page.warnings).toEqual([]);
  });

  it('produit des annonces normalisables', () => {
    const normalized = normalizeAll(page.listings, {
      sourceId: 'laforet',
      nowMs: Date.parse('2026-08-14T12:00:00.000Z'),
    });
    expect(normalized).toHaveLength(5);

    const first = normalized.find((item) => item.sourceRef === '40000001');
    expect(first?.price).toBe(690);
    expect(first?.area).toBe(34);
    expect(first?.rooms).toBe(1);
    expect(first?.city).toBe('nice');
    expect(first?.postalCode).toBe('06000');
    expect(first?.propertyType).toBe('apartment');
    expect(first?.furnished).toBe(true);
    expect(first?.contact.agencyName).toBe('Laforêt Nice Centre');
    // §17 : ce que la source ne publie pas reste inconnu.
    expect(first?.contact.phone).toBeNull();
    expect(first?.views).toBeNull();
    expect(first?.favorites).toBeNull();
  });

  it('normalise le studio non meublé sans le confondre avec un meublé', () => {
    const normalized = normalizeAll(page.listings, {
      sourceId: 'laforet',
      nowMs: Date.parse('2026-08-14T12:00:00.000Z'),
    });
    const studio = normalized.find((item) => item.sourceRef === '40000003');
    expect(studio?.propertyType).toBe('studio');
    expect(studio?.furnished).toBe(false);
    expect(studio?.price).toBe(650);
  });

  it('conserve les annonces des communes voisines avec leur vraie ville', () => {
    const normalized = normalizeAll(page.listings, {
      sourceId: 'laforet',
      nowMs: Date.parse('2026-08-14T12:00:00.000Z'),
    });
    const neighbour = normalized.find((item) => item.sourceRef === '40000004');
    expect(neighbour?.city).toBe('cagnes sur mer');
    expect(neighbour?.postalCode).toBe('06800');
  });
});

describe('parseSearchPage — cas limites (§50)', () => {
  const page = parseSearchPage(readFixture('nice-degraded.html'), PAGE_URL);

  it('ne lève pas d’exception sur une page dégradée', () => {
    expect(page.listings.length).toBeGreaterThan(0);
  });

  it('rend l’annonce sans prix, avec un prix absent plutôt qu’inventé', () => {
    const listing = page.listings.find((item) => item.sourceRef === '50000001');
    expect(listing).toBeDefined();
    expect(listing?.priceText).toBeUndefined();

    const [normalized] = normalizeAll([listing!], { sourceId: 'laforet', nowMs: 0 });
    expect(normalized?.price).toBeNull();
    expect(normalized?.area).toBe(28);
  });

  it('rend l’annonce sans surface, avec une surface absente', () => {
    const listing = page.listings.find((item) => item.sourceRef === '50000002');
    const [normalized] = normalizeAll([listing!], { sourceId: 'laforet', nowMs: 0 });
    expect(normalized?.price).toBe(595);
    expect(normalized?.area).toBeNull();
  });

  it('lit un format de prix inhabituel sans erreur de facteur 10', () => {
    const listing = page.listings.find((item) => item.sourceRef === '50000003');
    const [normalized] = normalizeAll([listing!], { sourceId: 'laforet', nowMs: 0 });
    expect(normalized?.price).toBe(1250.5);
    expect(normalized?.area).toBe(88.5);
  });

  it('reste fonctionnel malgré un balisage modifié', () => {
    // L'annonce 50000004 n'a plus aucun <span> interne : le parser doit
    // continuer à fonctionner puisqu'il s'ancre sur l'URL et le texte.
    const listing = page.listings.find((item) => item.sourceRef === '50000004');
    expect(listing).toBeDefined();
    const [normalized] = normalizeAll([listing!], { sourceId: 'laforet', nowMs: 0 });
    expect(normalized?.price).toBe(700);
    expect(normalized?.area).toBe(25);
    expect(normalized?.city).toBe('nice');
  });

  it('conserve une annonce vide sans planter, avec tous ses champs à null', () => {
    const listing = page.listings.find((item) => item.sourceRef === '50000005');
    expect(listing).toBeDefined();
    const [normalized] = normalizeAll([listing!], { sourceId: 'laforet', nowMs: 0 });
    expect(normalized?.price).toBeNull();
    expect(normalized?.area).toBeNull();
    // L'URL reste exploitable : l'annonce est consultable manuellement.
    expect(normalized?.sourceUrl).toContain('50000005');
  });
});

describe('surveillance des sources (§61)', () => {
  it('signale une page dont aucune annonce n’a de prix', () => {
    const html = `
      <a href="https://www.laforet.com/agence-immobiliere/nice-centre/louer/nice/appartement-1-piece-60000001">
        Appartement NICE (06000) 30 m²
      </a>
      <a href="https://www.laforet.com/agence-immobiliere/nice-centre/louer/nice/appartement-2-pieces-60000002">
        Appartement NICE (06000) 40 m²
      </a>`;
    const page = parseSearchPage(html, PAGE_URL);
    expect(page.warnings.join(' ')).toMatch(/structure probablement modifiée/);
  });

  it('signale un parsing partiellement dégradé', () => {
    const html = `
      <a href="https://www.laforet.com/agence-immobiliere/nice-centre/louer/nice/appartement-1-piece-60000001">
        Appartement 690 €/mois NICE (06000) 30 m²
      </a>
      <a href="https://www.laforet.com/agence-immobiliere/nice-centre/louer/nice/appartement-2-pieces-60000002">
        Appartement NICE (06000) 40 m²
      </a>
      <a href="https://www.laforet.com/agence-immobiliere/nice-centre/louer/nice/appartement-3-pieces-60000003">
        Appartement NICE (06000) 50 m²
      </a>`;
    const page = parseSearchPage(html, PAGE_URL);
    expect(page.warnings.join(' ')).toMatch(/parsing dégradé/);
  });

  it('ne laisse pas fuiter les attributs de tracking dans le titre (régression)', () => {
    // Laforêt porte des attributs `data-gtm-*` et un « > » dans l'URL, qui
    // cassaient l'ancien strip de balises par regex et polluaient le titre.
    const html = `<a
        href="https://www.laforet.com/agence-immobiliere/nice/louer/nice/appartement-1-piece-52444935?a=b>c#gtm#push"
        data-gtm-click-block-param="list-biens"
        data-gtm-click-name-param="Appartement">
        Appartement 620 €/mois NICE (06100) 22 m² 1 pièce Meublé
      </a>`;
    const page = parseSearchPage(html, PAGE_URL);
    const listing = page.listings.find((l) => l.sourceRef === '52444935');
    expect(listing?.title).toBe('Appartement 620 €/mois NICE (06100) 22 m² 1 pièce Meublé');
    expect(listing?.title).not.toMatch(/gtm|data-/);
  });
});

describe('parseDetailPage (Laforêt)', () => {
  const description = parseDetailPage(readFixture('fiche.html'))?.description ?? '';

  it('lit la description entière, pas la meta coupée par « ... »', () => {
    expect(description).toMatch(/^Votre agence Laforêt Nice Centre vous propose/);
    expect(description).toContain('de nombreux espaces de rangement complètent ce bien.');
    // La dernière phrase du texte de l'agence, puis les montants.
    expect(description).toContain('Garage fermé inclus à proximité');
    expect(description).toContain('Dépôt de garantie : 6 370,00 €');
  });

  it('écarte les mentions légales et les références de l’agence', () => {
    expect(description).not.toMatch(/Siège social|Mentions légales|Référence web/);
  });

  it('ne conclut rien d’une page sans description (§17)', () => {
    expect(parseDetailPage('<html><body></body></html>')).toBeNull();
  });

  it('lit les montants, le téléphone et l’e-mail de l’agence', () => {
    const draft = parseDetailPage(readFixture('fiche.html'));
    expect(draft?.chargesText).toBe('215,00 €');
    expect(draft?.depositText).toBe('6 370,00 €');
    expect(draft?.feesText).toBe('1 500,00 €');
    expect(draft?.phoneText).toBe('0600000002');
    expect(draft?.emailText).toBe('contact@example.invalid');
  });

  it('va jusqu’à la fiche normalisée', () => {
    const [normalized] = normalizeAll(
      [
        {
          sourceRef: '52819662',
          sourceUrl: 'https://www.laforet.com/agence-immobiliere/nice-centre/louer/nice/x-52819662',
          priceText: '3 400 €/mois',
          ...parseDetailPage(readFixture('fiche.html')),
        },
      ],
      { sourceId: 'laforet', nowMs: Date.parse('2026-09-15T12:00:00.000Z') },
    );
    expect(normalized?.charges).toBe(215);
    expect(normalized?.deposit).toBe(6370);
    expect(normalized?.tenantFees).toBe(1500);
    expect(normalized?.contact.phone).not.toBeNull();
  });
});

describe('carte de la page ville (Laforêt)', () => {
  const page = parseSearchPage(readFixture('carte-photos.html'), PAGE_URL);
  const listing = page.listings.find((l) => l.sourceRef === '19168366');

  it('garde les photos du carrousel, en adresse absolue', () => {
    expect(listing?.imageUrls).toHaveLength(2);
    expect(listing?.imageUrls?.[0]).toMatch(
      /^https:\/\/www\.laforet\.com\/glide\/.+19168366a\.jpg/,
    );
  });

  it('lit le numéro du bouton d’appel de la carte', () => {
    expect(listing?.phoneText).toBe('0600000041');
  });

  it('garde le titre complet malgré les liens photo', () => {
    expect(listing?.priceText).toBe('1 080 €/mois');
  });
});

describe('parseDpeSvg (Laforêt)', () => {
  it('lit la classe dans le groupe racine de l’étiquette', () => {
    expect(parseDpeSvg(readFixture('etiquette-dpe.svg'))).toBe('E');
  });

  it('ne devine rien d’une réponse illisible', () => {
    expect(parseDpeSvg('<html>Erreur</html>')).toBeUndefined();
  });
});
