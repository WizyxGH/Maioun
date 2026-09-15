import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHORT_TERM_LEASE_FEATURE } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetailPage, parseListingUrl, parseListPage } from './parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/hektor');
const BASE = 'https://www.agence-fictive.fr/location/1';
const DETAIL_URL =
  'https://www.agence-fictive.fr/location/1-nice/appartement/t3/31-sett-gambetta-disponible-le-1er-septembre-2027/';

const liste = readFileSync(join(FIXTURES, 'liste.html'), 'utf8');
const detail = readFileSync(join(FIXTURES, 'detail-31.html'), 'utf8');

describe('parseListingUrl', () => {
  it('décompose les deux formes de fiches de la plateforme', () => {
    const zone = parseListingUrl(DETAIL_URL, BASE);
    expect(zone?.reference).toBe('31');
    expect(zone?.citySlug).toBe('nice');

    const plain = parseListingUrl('/92-location-parking.html', BASE);
    expect(plain?.reference).toBe('92');
    expect(plain?.citySlug).toBeNull();
  });

  it('ne prend pas le département préfixé pour la commune', () => {
    const url = parseListingUrl(
      'https://www.aagestion.net/location/06-alpes-maritimes/1-nice/nice-garibaldi-3-pieces/396-appartement',
      'https://www.aagestion.net/location/1',
    );
    expect(url?.citySlug).toBe('nice');
  });

  it('rejette pagination, pages éditoriales et autres domaines', () => {
    expect(parseListingUrl('/location/2', BASE)).toBeNull();
    expect(parseListingUrl('/contact.html', BASE)).toBeNull();
    expect(
      parseListingUrl('https://autre-site.exemple/location/1-nice/appartement/99-x', BASE),
    ).toBeNull();
  });
});

describe('parseListPage', () => {
  it('extrait les fiches du site, dédoublonnées, sans les liens externes', () => {
    const { urls, warnings } = parseListPage(liste, BASE);
    expect(warnings).toHaveLength(0);
    expect(urls.map((url) => url.reference).sort()).toEqual(['31', '42', '92']);
  });

  it('lit aussi les boutons `data-url` d’une annonce sans lien de titre (Sud Agence)', () => {
    const { urls } = parseListPage(
      readFileSync(join(FIXTURES, 'liste-data-url.html'), 'utf8'),
      'https://www.agence-fictive.fr/location/1',
    );
    expect(urls.map((url) => url.reference)).toEqual(['568', '565']);
    expect(urls[1]?.citySlug).toBe('nice');
    expect(urls[0]?.canonicalUrl).not.toContain('#');
  });

  it('signale une liste sans fiche (structure changée, §69)', () => {
    const { warnings } = parseListPage('<html><body>vide</body></html>', BASE);
    expect(warnings).toHaveLength(1);
  });
});

describe('parseDetailPage', () => {
  const { listing, warnings } = parseDetailPage(detail, DETAIL_URL, 'Agence Fictive');

  it('extrait la fiche complète sans warning', () => {
    expect(warnings).toHaveLength(0);
    expect(listing?.sourceRef).toBe('31');
    expect(listing?.priceText).toBe('1 460 € CC');
    expect(listing?.chargesText).toContain('110 €');
    expect(listing?.areaText).toBe('54.25m²');
    expect(listing?.roomsText).toBe('3 pièces');
    expect(listing?.postalCodeText).toBe('06000');
    expect(listing?.cityText).toBe('Nice');
    // La terrasse est à NON : seul le balcon (OUI) devient un atout.
    expect(listing?.extra?.['features']).toContain('Balcon');
    expect(listing?.extra?.['features']).not.toContain('Terrasse');
    // Seules les vraies photos (/images/biens/) : l'avatar d'agence et le logo
    // du CDN sont écartés — sinon envoyés à tort comme photo d'alerte (§29).
    expect(listing?.imageUrls).toHaveLength(2);
    expect(listing?.imageUrls?.every((u) => u.includes('/images/biens/'))).toBe(true);
    // La photo « original » est normalisée vers la taille d'affichage.
    expect(listing?.imageUrls?.[0]).toContain('/1600xauto/');
  });

  it('se normalise, disponibilité et exclusivité étudiante comprises', () => {
    const normalized = normalizeListing(listing as NonNullable<typeof listing>, {
      sourceId: 'hektor-test',
      nowMs: Date.parse('2026-08-17T12:00:00Z'),
    });
    expect(normalized).not.toBeNull();
    if (normalized === null) return;
    expect(normalized.price).toBe(1460);
    expect(normalized.chargesIncluded).toBe(true);
    expect(normalized.area).toBe(54.25);
    expect(normalized.rooms).toBe(3);
    expect(normalized.propertyType).toBe('apartment');
    expect(normalized.furnished).toBe(true);
    expect(normalized.city).toBe('nice');
    // « DISPONIBLE LE 1ER SEPTEMBRE 2027 » dans le titre → date de dispo.
    expect(normalized.availableAt).toBe('2027-09-01T00:00:00.000Z');
  });
});

// Fiches réelles relevées le 2026-09-14, allégées : trois gabarits sans table
// `table-aria`, où prix, surface et commune ne se lisaient pas.
describe('parseDetailPage — gabarits sans table', () => {
  const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
  const normalize = (listing: Parameters<typeof normalizeListing>[0]) =>
    normalizeListing(listing, {
      sourceId: 'hektor-test',
      nowMs: Date.parse('2026-09-14T12:00:00Z'),
    });

  it('liste « libellé : valeur » (AA Gestion), département dans l’URL', () => {
    const url =
      'https://www.aagestion.net/location/06-alpes-maritimes/1-nice/nice-garibaldi-3-pieces-97m2-lumineux-a-deux-pas-de-la-coulee-verte/396-appartement';
    const { listing, warnings } = parseDetailPage(
      read('detail-aa-gestion.html'),
      url,
      'AA Gestion',
    );
    expect(warnings).toHaveLength(0);
    expect(listing?.priceText).toBe('1 400 € CC');
    expect(listing?.chargesText).toBe('50 € de charges');
    // La référence de l'agence, pas l'identifiant d'URL (396).
    expect(listing?.extra?.['reference']).toBe('1');
    expect(listing?.postalCodeText).toBe('06300');
    expect(listing?.cityText).toBe('Nice');
    expect(listing?.description).toMatch(/^Nous vous proposons/);
    const normalized = normalize(listing as NonNullable<typeof listing>);
    expect(normalized?.price).toBe(1400);
    expect(normalized?.area).toBe(99);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.furnished).toBe(false);
  });

  it('paires title_finance / price_finance (Côté Village)', () => {
    const url =
      'https://www.immobilier-cote-village.com/location/1-la-trinite/duplex/1216-a-louer-la-trinite-grand-duplex-108-m-avec-terrasse-de-plus-de-100-m';
    const { listing, warnings } = parseDetailPage(
      read('detail-cote-village.html'),
      url,
      'Côté Village',
    );
    expect(warnings).toHaveLength(0);
    expect(listing?.priceText).toBe('1 800 € CC');
    const normalized = normalize(listing as NonNullable<typeof listing>);
    expect(normalized?.price).toBe(1800);
    expect(normalized?.area).toBe(108);
    expect(normalized?.city).toBe('la trinite');
    // « 3 chambre(s) » compte les chambres : c'est un duplex.
    expect(normalized?.propertyType).toBe('apartment');
    expect(normalized?.contact.reference).toBe('MSLDU470001216');
    expect(normalized?.postalCode).toBe('06340');
  });

  it('quartier, référence, code postal et téléphone du gabarit « detail_content » (Méditerranée Immo)', () => {
    const url =
      'https://www.mediterranee-immo.fr/location/3-nice/studio/9-nice-location-studio-neuf-dans-jolie-maison-au-calme-vue-collines-et-verdure';
    const { listing } = parseDetailPage(
      read('detail-mediterranee-immo.html'),
      url,
      'Méditerranée Immo',
    );
    expect(listing?.extra?.['quartier']).toBe('LE PIOL');
    expect(listing?.phoneText).toBe('06 00 00 00 01');
    const normalized = normalize(listing as NonNullable<typeof listing>);
    expect(normalized).toMatchObject({
      price: 660,
      area: 30,
      district: 'LE PIOL',
      postalCode: '06000',
      city: 'nice',
    });
    expect(normalized?.contact.reference).toBe('L02');
    expect(normalized?.contact.phone).toBe('+33600000001');
    expect(normalized?.features).toContain('Cave');
  });

  it('ancien gabarit, sans commune dans l’URL ni h1 utile (Agence Passy)', () => {
    const url = 'https://www.agencepassy.com/1402-4-pieces-114-m2-nice-liberation.html';
    const { listing, warnings } = parseDetailPage(
      read('detail-agence-passy.html'),
      url,
      'Agence Passy',
    );
    expect(warnings).toHaveLength(0);
    expect(listing?.title).toBe('Location 4 pièces 114 m2 - Nice Liberation');
    expect(listing?.priceText).toBe('1 980 € CC');
    expect(listing?.chargesText).toBe('68 € de charges');
    expect(listing?.cityText).toBe('Nice');
    const normalized = normalize(listing as NonNullable<typeof listing>);
    expect(normalized?.price).toBe(1980);
    expect(normalized?.rooms).toBe(4);
    expect(normalized?.postalCode).toBe('06000');
  });

  it('gabarit « contentDt » : la description n’a que son microdata (Immobilière GTI)', () => {
    const url = 'https://www.immobilieregti.com/18309-nice-proche-liberation-studio-vide.html';
    const { listing } = parseDetailPage(read('detail-content-dt.html'), url, 'Immobilière GTI');
    // Relevé réel : description vide, alors qu'elle donnait la rue.
    expect(listing?.description).toContain('RUE CAVENDISH');
    expect(listing?.description).toContain('Revenu minimum de 1600euros');
    const normalized = normalize(listing as NonNullable<typeof listing>);
    expect(normalized?.address).toBe('RUE CAVENDISH');
    expect(normalized).toMatchObject({ price: 590, deposit: 560, tenantFees: 283 });
  });

  it('gabarit éditorial, table sans classes de clé (Aurus)', () => {
    const url =
      'https://www.aurusimmo.com/location/06-alpes-maritimes/73-nice/2-appartement/t1/22-magnifique-f1-apercu-mer/';
    const { listing, warnings } = parseDetailPage(read('detail-aurus.html'), url, 'Aurus');
    expect(warnings).toHaveLength(0);
    // Le premier span du h1 est la commune, pas le titre.
    expect(listing?.title).toBe('Magnifique F1 Aperçu Mer');
    expect(listing?.priceText).toBe('750 € HC');
    expect(listing?.description).toContain('BAIL ÉTUDIANT DÉROGATOIRE 9 MOIS');
    // « Non renseigné » ne dit pas « non meublé ».
    expect(listing?.furnishedText).toBe('');
    expect(listing?.phoneText).toBe('0600000010');
    // Les photos de « Ces biens peuvent aussi vous intéresser » sont écartées.
    expect(listing?.imageUrls?.every((photo) => photo.includes('de31e27798b1697e'))).toBe(true);

    const normalized = normalize(listing as NonNullable<typeof listing>);
    expect(normalized).toMatchObject({
      price: 750,
      chargesIncluded: false,
      charges: 30,
      deposit: 1100,
      tenantFees: 500,
      propertyType: 'apartment',
      district: 'Cimiez',
      availableAt: '2026-09-05T00:00:00.000Z',
    });
    expect(normalized?.features).toContain('Balcon');
    expect(normalized?.features).toContain(SHORT_TERM_LEASE_FEATURE);
    expect(normalized?.features).not.toContain('Parking');
  });

  it('titre libre sans pièces : le h1 engendré les donne (Englimmo)', () => {
    const url =
      'https://www.agence-fictive.com/location/1-nice/studio/61-etudiant-9-mois-2026-2027';
    const { listing, warnings } = parseDetailPage(read('detail-englimmo.html'), url, 'Englimmo');
    expect(warnings).toHaveLength(0);
    expect(listing).toMatchObject({
      sourceRef: '61',
      priceText: '789 € CC',
      chargesText: '89 € de charges',
      areaText: '31 m²',
      roomsText: '1 pièce',
      cityText: 'nice',
      postalCodeText: '06200',
      depositText: '1 400 €',
      feesText: '403 €',
    });
    expect(listing?.extra?.['reference']).toBe('51');
    expect(listing?.description).toContain('honoraires location 13*31m2 =403€');
    // « Consulter les autres biens » : la photo de l’autre annonce est écartée.
    expect(listing?.imageUrls).toHaveLength(1);
    expect(listing?.imageUrls?.[0]).toContain('24bacb08515c2715');
  });
});
