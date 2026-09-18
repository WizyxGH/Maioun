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

describe('parseListPage — la page suivante', () => {
  /**
   * TROIS HABILLAGES POUR LA MÊME PAGINATION, selon l'âge du gabarit. Les
   * descripteurs écrivaient leurs pages à la main : giletta-properties.com en
   * déclarait trois pour six publiées, et vingt-trois annonces n'avaient jamais
   * été vues.
   */
  it('lit la liste à boutons, le bloc à flèches et le lien `rel=next`', () => {
    const boutons = `<ul class="pagination">
      <li><span class="btn btn-default active">1</span></li>
      <li><a href="/location/2" class="btn btn-default">2</a></li>
    </ul>`;
    expect(parseListPage(boutons, BASE).nextPageUrl).toBe(
      'https://www.agence-fictive.fr/location/2',
    );

    const fleches = `<article class="pagination"><ul class="pagination__items">
      <li class="pagination__item--active"><span class="pagination__link">1</span></li>
      <li><a class="pagination__link" href="/location/2" aria-label="Aller à la page 2">2</a></li>
      <li><a class="pagination__link" href="/location/6" aria-label="Aller à la page 6">6</a></li>
    </ul></article>`;
    // Le SUIVANT, et non le plus grand numéro affiché.
    expect(parseListPage(fleches, BASE).nextPageUrl).toBe(
      'https://www.agence-fictive.fr/location/2',
    );

    const entete = '<link rel="next" href="/location/2"/>';
    expect(parseListPage(entete, BASE).nextPageUrl).toBe(
      'https://www.agence-fictive.fr/location/2',
    );
  });

  it('ne recule jamais, et ne sort pas de sa liste', () => {
    // Depuis la page 5, les liens vers 1, 3 et 4 ne sont pas des suivants ; la
    // liste des ventes et un autre domaine ne le sont pas davantage.
    const page5 = 'https://www.agence-fictive.fr/location/5';
    const html = `<ul class="pagination">
      <li><a href="/location/1">1</a></li>
      <li><a href="/location/3">3</a></li>
      <li><a href="/location/4">4</a></li>
      <li><a href="/a-vendre/9">ventes</a></li>
      <li><a href="https://www.autre-agence.fr/location/6">ailleurs</a></li>
      <li><a href="/location/6">6</a></li>
    </ul>`;
    expect(parseListPage(html, page5).nextPageUrl).toBe('https://www.agence-fictive.fr/location/6');
  });

  it('ne dit rien de suivant sur la dernière page', () => {
    const derniere = `<ul class="pagination">
      <li><a href="/location/1" class="btn btn-default">1</a></li>
      <li><span class="btn btn-default active">2</span></li>
    </ul>`;
    expect(
      parseListPage(derniere, 'https://www.agence-fictive.fr/location/2').nextPageUrl,
    ).toBeNull();
  });

  it('garde le chemin de la liste, même découpée par commune et par type', () => {
    // agenceimmosud.com : `/location/1-nice/appartement/1`, où le dernier
    // segment seul est le numéro de page.
    const url = 'https://www.agence-fictive.fr/location/1-nice/appartement/1';
    const html =
      '<ul class="pagination"><li><a href="/location/1-nice/appartement/2">2</a></li></ul>';
    expect(parseListPage(html, url).nextPageUrl).toBe(
      'https://www.agence-fictive.fr/location/1-nice/appartement/2',
    );
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

  it('une liste réduite à la fiche de démonstration est vide (Gestymo, Domi Nice)', () => {
    const untitled = `<article><a href="/location/-/3-boulouparis/2-appartement/t1/2-/" class="item__title">
      <span class="title__content-1">Boulouparis (98812)</span></a><div class="item__reference">Réf : 456</div></article>`;
    expect(parseListPage(untitled, BASE)).toEqual({
      urls: [],
      warnings: [],
      empty: true,
      nextPageUrl: null,
    });
    const test = '<a href="/location/40-paris/terrain/351-test">test</a>';
    expect(parseListPage(test, BASE)).toMatchObject({ urls: [], empty: true });
    // À côté d'un vrai bien, la fiche de démonstration est seulement ignorée.
    const mixed = `${test}<a href="/location/1-nice/appartement/31-t2">T2</a>`;
    expect(parseListPage(mixed, BASE)).toMatchObject({ empty: false, warnings: [] });
    expect(parseListPage(mixed, BASE).urls.map((url) => url.reference)).toEqual(['31']);
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
    // Les quatre photos de la galerie, dont la première dans son dossier
    // `original/` : seule la taille change, sinon l'adresse tombait en 404.
    const cdn =
      'https://mediterraneeimmo.staticlbi.com/1600xauto/images/biens/1/dc2bb12b70f7a242610c1e1498f3e60f';
    expect(listing?.imageUrls).toEqual([
      `${cdn}/original/photo_e4add0c8cf1e6accf75918ecadc2bf79.jpg`,
      `${cdn}/photo_a79300966ac26d93254613a6256f06b4.jpg`,
      `${cdn}/photo_c4a9abfc2e463fc531b140f7a51ea59f.jpg`,
      `${cdn}/photo_414bdd8c757026ad1835bc05f2917866.jpg`,
    ]);
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

// Relevés du 2026-09-15 : DPE, quartier et rue là où la plateforme les écrit.
describe('parseDetailPage — DPE, quartier, rue', () => {
  const url = 'https://www.agence-fictive.fr/location/1-nice/appartement/3688-madeleine-3-pieces';
  const page = (body: string) =>
    `<html><head><title>Location appartement Nice 2 pièces 40m² 900€</title></head><body>${body}</body></html>`;

  it('lit la lettre active du gabarit à pastilles (Midem)', () => {
    const html = readFileSync(join(FIXTURES, 'detail-pastilles.html'), 'utf8');
    const { listing, warnings } = parseDetailPage(html, url, 'Agence');
    expect(warnings).toHaveLength(0);
    expect(listing?.extra).toMatchObject({ dpe: 'B', ges: 'A', quartier: 'MADELEINE' });
    expect(listing).toMatchObject({ depositText: '1 145 €', feesText: '832,72 €' });
    const normalized = normalizeListing(listing as NonNullable<typeof listing>, {
      sourceId: 'hektor-test',
      nowMs: Date.parse('2026-09-15T12:00:00Z'),
    });
    expect(normalized).toMatchObject({ dpe: 'B', district: 'MADELEINE', charges: 205 });
  });

  it('ne prend pas l’image du DPE ni « DPE vierge » pour une classe', () => {
    const html =
      page(`<div class="energy__drawing"><img src="/admin/dpe.php?lang=fr&idann=1" alt="DPE"></div>
      <div class="bubble_diag bubble_dpe bubble_dpe--unactive"><span class="bubble bubble_dpe_a">A</span></div>
      <div class="energy__label">DPE vierge</div>`);
    expect(parseDetailPage(html, url, 'Agence').listing?.extra?.['dpe']).toBeUndefined();
  });

  it('quartier de la table (Immobilière Niçoise) sans le préfixe de la commune', () => {
    const html = page(`<div class="table-aria__tr QUARTIER" role="row">
      <span class="table-aria__td" role="cell">Quartier</span>
      <span class="table-aria__td" role="cell"> NICE - CIMIEZ </span></div>`);
    expect(parseDetailPage(html, url, 'Agence').listing?.extra?.['quartier']).toBe('CIMIEZ');
  });

  it('quartier en paire termInfos (Bérénice)', () => {
    const html = page(`<p class="data"><span class="termInfos">Quartier</span>
      <span class="valueInfos ">LANTERNE</span></p>`);
    expect(parseDetailPage(html, url, 'Agence').listing?.extra?.['quartier']).toBe('LANTERNE');
  });

  it('rue saisie dans le champ référence (Méditerranée Immo)', () => {
    const html =
      page(`<span class="ref_item">Référence <span class="id_ref_item">37 Boulevard François Grosso</span></span>
      <span class="title_finance">Dépôt de garantie TTC</span> <span class="price_finance">1 €</span>`);
    const { listing } = parseDetailPage(html, url, 'Agence');
    expect(listing?.addressText).toBe('37 Boulevard François Grosso');
    // Pas une référence, et l'URL n'en fournit pas : le champ reste vide (§17).
    expect(listing?.extra?.['reference']).toBeUndefined();
    // « 1 € » de dépôt : remplissage, pas un montant.
    expect(listing?.depositText).toBeUndefined();
  });

  it('écarte la fiche de démonstration « test » sans avertissement (Domi Nice)', () => {
    const demo = 'https://www.agence-fictive.fr/location/40-paris/terrain/351-test';
    expect(parseDetailPage(page('<h1>test</h1>'), demo, 'Agence')).toEqual({
      listing: null,
      warnings: [],
    });
  });
});

describe('parseDetailPage — ancien gabarit sans commune au titre (Marro)', () => {
  const url = 'https://www.agence-fictive.fr/1748-appartement-3-piece-s-64-36m-a-louer.html';
  const html = (postalCode: string) => `<html><head>
    <title>Location Appartement 3 pièce(s) 64,36m² à louer</title></head><body>
    <h1 itemprop="name">Appartement 3 pièce(s) 64,36m² à louer</h1>
    <p class="data"><span class="termInfos">Code postal</span>
      <span class="valueInfos">${postalCode}</span></p>
    </body></html>`;

  it('ne prend pas « 3 pièce(s) » pour la commune : le code postal la donne', () => {
    const { listing } = parseDetailPage(html('06000'), url, 'Agence');
    expect(listing?.cityText).toBe('Nice');
    expect(listing?.postalCodeText).toBe('06000');
  });

  it('laisse la commune inconnue plutôt que d’en inventer une', () => {
    const { listing } = parseDetailPage(html('06700'), url, 'Agence');
    expect(listing?.cityText).toBeUndefined();
  });
});

describe('type de bien', () => {
  const page = '<html><head><title>Location Magnifique F1 Aperçu Mer</title></head></html>';

  it('lit le segment de type sans numéro (Immo 3 Points)', () => {
    const url = 'https://www.agence-fictive.fr/location/1-nice/appartement/205-beau-t2';
    expect(parseDetailPage(page, url, 'Agence').listing?.propertyTypeText).toBe('appartement');
  });

  it('ne prend jamais l’adresse de la fiche pour un type', () => {
    const url = 'https://www.agence-fictive.fr/384-4-pieces-carre-d-or.html';
    expect(parseDetailPage(page, url, 'Agence').listing?.propertyTypeText).toBeUndefined();
  });

  it('lit le type du DERNIER segment quand le titre est libre (Sud Agence)', () => {
    // « Location Magnifique F1… » ne nomme aucun type : cinq fiches sur neuf
    // n'en avaient aucun, alors que leur adresse le porte.
    const urls = {
      appartement:
        'https://www.agence-fictive.fr/location/06-alpes-maritimes/1-nice//565-appartement',
      garage:
        'https://www.agence-fictive.fr/location/06-alpes-maritimes/1-nice/garage-quartier-est/282-garage',
      parking: 'https://www.agence-fictive.fr/location/1-nice/parking-securise/542-parking',
    };
    for (const [attendu, url] of Object.entries(urls)) {
      expect(parseDetailPage(page, url, 'Agence').listing?.propertyTypeText).toBe(attendu);
    }
  });

  it('le segment doit valoir le type ENTIER, pas le commencer', () => {
    // « 282-garage-saint-roch » est un titre en slug, pas une catégorie.
    const url = 'https://www.agence-fictive.fr/location/1-nice/282-garage-quartier-est';
    expect(parseDetailPage(page, url, 'Agence').listing?.propertyTypeText).toBeUndefined();
  });
});

// Relevés du 2026-09-16 sur sudagence.fr : gabarit « li.data », fiche retirée
// servie en 200, référence à espaces et surface arrondie au titre.
describe('parseDetailPage — fiche retirée, référence et surface déclarées', () => {
  const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
  const URL_FICHE =
    'https://www.agence-fictive.fr/location/06-alpes-maritimes/1-nice/grand-studio-vide-de-33-m-quartier-nord-790/554-appartement';
  const URL_RETIREE =
    'https://www.agence-fictive.fr/location/06-alpes-maritimes/1-nice/garage-quartier-est/282-garage';

  it('ne lit rien de l’accueil servi à la place d’une fiche retirée', () => {
    // Sans cette garde : une annonce dont le titre valait le nom de l'agence,
    // le type « autre » et tout le reste vide, affichée comme un bien à visiter.
    expect(
      parseDetailPage(read('detail-redirigee-accueil.html'), URL_RETIREE, 'Agence Fictive'),
    ).toEqual({ listing: null, warnings: [], withdrawn: true });
  });

  it('le nom de l’agence n’est jamais le titre d’une annonce', () => {
    // Même page, sans canonique : la garde de dernier recours tient encore.
    const sansCanonique = read('detail-redirigee-accueil.html').replace(
      /<link rel="canonical"[^>]*>/,
      '',
    );
    const { listing } = parseDetailPage(sansCanonique, URL_RETIREE, 'Agence Fictive');
    expect(listing?.title).toBeUndefined();
  });

  it('une canonique qui désigne bien la fiche ne retire rien', () => {
    const { listing, withdrawn } = parseDetailPage(
      read('detail-li-data.html'),
      URL_FICHE,
      'Agence Fictive',
    );
    expect(withdrawn).toBeUndefined();
    expect(listing).not.toBeNull();
  });

  it('garde la référence de l’agence même quand elle contient des espaces', () => {
    const { listing } = parseDetailPage(read('detail-li-data.html'), URL_FICHE, 'Agence Fictive');
    // Avant : l'identifiant d'URL (554), qui ne retrouve l'annonce nulle part.
    expect(listing?.extra?.['reference']).toBe('LOC F1 QUARTIER NORD-1');
  });

  it('préfère la surface habitable déclarée à celle arrondie dans le titre', () => {
    const { listing, warnings } = parseDetailPage(
      read('detail-li-data.html'),
      URL_FICHE,
      'Agence Fictive',
    );
    expect(warnings).toHaveLength(0);
    // Le titre dit « 33 m² », la fiche déclare 33,26 m².
    expect(listing?.areaText).toBe('33,26 m²');
    const normalized = normalizeListing(listing as NonNullable<typeof listing>, {
      sourceId: 'hektor-test',
      nowMs: Date.parse('2026-09-16T12:00:00Z'),
    });
    expect(normalized).toMatchObject({
      area: 33.26,
      price: 750,
      charges: 50,
      chargesIncluded: true,
      // Non renseigné dans la table : c'est la description qui le publie.
      deposit: 700,
      tenantFees: 335.59,
      rooms: 1,
      furnished: false,
      postalCode: '06300',
      city: 'nice',
      // Image sous /admin, interdite par robots : laissée inconnue (§17).
      dpe: null,
    });
    expect(normalized?.contact.phone).toBe('+33600000044');
    expect(normalized?.contact.email).toBe('agence@example.invalid');
  });

  // Relevé du 2026-09-17 sur sudagence.fr : la fiche ne porte AUCUNE coordonnée
  // en pied de page, seulement le bouton « Afficher le téléphone ».
  const ficheSansPied = (extraLignes = ''): string =>
    `<html><head><title>Location Superbe appartement Nice 62.54m² 1107€</title></head>
     <body><p class="ref">Référence : LOC3PMONTBORON</p>
     <h1 class="titleBien">Superbe appartement dans les hauteurs de Nice - 1107€</h1>
     <ul><li class="data">Loyer CC* / mois : 1 190 €</li>
     <li class="data">Charges locatives (provision donnant lieu à régularisation annuelle) : 82 €</li>
     <li class="data">Surface habitable (m²) : 62,54 m²</li>
     <li class="data">Nombre de pièces : 3</li>
     <li class="data">Meublé : NON</li>${extraLignes}</ul>
     <a href="tel:06 00 00 00 08 " class="dispPhoneAgency">Afficher le téléphone</a>
     </body></html>`;
  const URL_553 =
    'https://www.agence-fictive.fr/location/06-alpes-maritimes/1-nice/superbe-appartement/553-appartement';

  it('lit le bouton « Afficher le téléphone » quand la fiche n’a pas de pied de page', () => {
    // Sans lui, ces fiches sortaient sans numéro : on ne pouvait que remplir le
    // formulaire et attendre une réponse.
    const { listing } = parseDetailPage(ficheSansPied(), URL_553, 'Agence Fictive');
    expect(listing?.phoneText).toBe('06 00 00 00 08');
  });

  it('garde le balcon déclaré d’un logement NON meublé', () => {
    // « Meublé : NON » et « Balcon : OUI » se suivaient dans le texte assemblé
    // pour la normalisation : « … non meublé Balcon » niait le balcon.
    const { listing } = parseDetailPage(
      ficheSansPied('<li class="data">Balcon : OUI</li><li class="data">Cave : OUI</li>'),
      URL_553,
      'Agence Fictive',
    );
    expect(listing?.extra?.['features']).toBe('Balcon · Cave');
    const normalized = normalizeListing(listing as NonNullable<typeof listing>, {
      sourceId: 'hektor-test',
      nowMs: Date.parse('2026-09-17T12:00:00Z'),
    });
    expect(normalized?.features).toContain('Balcon');
    expect(normalized?.features).toContain('Cave');
    expect(normalized?.furnished).toBe(false);
  });
});

describe('liste sans liens de fiche (Riviera Angels)', () => {
  // Liste et fiche réelles du 2026-09-15, allégées et anonymisées.
  const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');
  const FICHE_URL = 'https://www.riviera-angels.com/384-4-pieces-carre-d-or-colocation.html';

  it('reconstruit l’adresse de fiche depuis l’identifiant et le titre', () => {
    const { urls, warnings } = parseListPage(
      read('liste-sans-liens.html'),
      'https://www.riviera-angels.com/a-louer/1',
    );
    expect(warnings).toHaveLength(0);
    expect(urls.map((url) => [url.reference, url.canonicalUrl])).toEqual([
      ['384', FICHE_URL],
      ['382', 'https://www.riviera-angels.com/382-2-pieces-dernier-etage-balcon-terrasse.html'],
    ]);
  });

  it('lit la fiche, sans la vignette d’une autre annonce', () => {
    const { listing } = parseDetailPage(read('detail-riviera-angels.html'), FICHE_URL, 'Riviera');
    expect(listing).toMatchObject({
      title: "4 PIECES CARRE D'OR COLOCATION",
      priceText: '2 100 € CC',
      chargesText: '110 € de charges',
      depositText: '3 980 €',
      feesText: '1 422,99 €',
      areaText: '108,46 m²',
      roomsText: '4 pièces 3 chambres',
      cityText: 'Nice',
      postalCodeText: '06000',
      extra: { reference: 'SMLAP50000384', etage: '4' },
    });
    expect(listing?.propertyTypeText).toBeUndefined();
    expect(listing?.description).toMatch(/^Au cœur du Carré d’Or[\s\S]+GARANTME souhaitée\.$/);
    expect(listing?.imageUrls).toHaveLength(10);
    expect(listing?.imageUrls?.every((url) => url.includes('/b53e6e9009fa8dce'))).toBe(true);
  });

  it('garde la galerie du bien quand un bloc inconnu glisse une autre photo', () => {
    const html = `<html><head><title>Location Appartement Nice</title></head><body>
      <img data-src="//a.staticlbi.com/original/images/biens/1/aaa/photo_1.jpg">
      <img data-src="//a.staticlbi.com/original/images/biens/1/aaa/photo_2.jpg">
      <div class="autres"><img data-src="//a.staticlbi.com/500xauto/images/biens/1/bbb/photo_9.jpg"></div>
      </body></html>`;
    const { listing } = parseDetailPage(html, 'https://www.agence-fictive.fr/7-t2.html', 'Agence');
    expect(listing?.imageUrls).toEqual([
      'https://a.staticlbi.com/1600xauto/images/biens/1/aaa/photo_1.jpg',
      'https://a.staticlbi.com/1600xauto/images/biens/1/aaa/photo_2.jpg',
    ]);
  });

  // Relevé du 2026-09-18 : le carrousel « biens similaires » de la plateforme
  // glisse UNE vignette face à UNE seule photo de galerie. À égalité, compter
  // les photos ne départage plus ; c'est l'ordre du document qui tranche, la
  // galerie du bien venant toujours avant le carrousel.
  it('garde la photo du bien quand le carrousel « similaires » en glisse autant', () => {
    const html = `<html><head><title>Location Appartement Nice</title></head><body>
      <img src="//a.staticlbi.com/1100x1100/images/biens/1/aaa/photo_1.jpg">
      <div class="bienSim"><div id="carouselSim"><ul class="carousel-inner"><li>
        <article onClick="location.href='/18314-autre-bien.html'">
          <div class="imgSim"><img src="//a.staticlbi.com/220xauto/images/biens/1/bbb/photo_9.jpg"></div>
        </article>
      </li></ul></div></div>
      </body></html>`;
    const { listing } = parseDetailPage(html, 'https://www.agence-fictive.fr/7-t2.html', 'Agence');
    expect(listing?.imageUrls).toEqual([
      'https://a.staticlbi.com/1600xauto/images/biens/1/aaa/photo_1.jpg',
    ]);
  });
});

// Gabarit à liste de caractéristiques (Cabinet AGIR), relevé du 2026-09-16 :
// l'étage, les chambres et l'e-mail de l'agence y sont écrits, et la hauteur de
// l'immeuble juste à côté de l'étage du logement.
describe('parseDetailPage — caractéristiques en liste, coordonnées du pied de page', () => {
  const URL = 'https://www.agence-fictive.fr/location/1-nice/appartement/1043-3p-meuble';
  const page = (items: string, footer = '') =>
    `<html><head><title>Location appartement Nice 3 pièces 39.52m² 1370€</title></head>
     <body><h1>Appartement 3 pièce(s) 2 chambre(s) 39.52 m²</h1>
     <ul class="list_items">${items}</ul>
     <div class="footer_element__content">${footer}</div></body></html>`;
  const items = `<li class="list_item">Surface 39,52 m²</li>
     <li class="list_item">2 chambre(s)</li>
     <li class="list_item">1er étage</li>
     <li class="list_item">5 étage(s)</li>
     <li class="list_item">ascenseur</li>`;

  it('lit l’étage et les chambres du logement', () => {
    const { listing } = parseDetailPage(page(items), URL, 'Agence');
    expect(listing?.extra?.['etage']).toBe('1');
    expect(listing?.roomsText).toBe('3 pièces 2 chambres');
  });

  it('ne prend pas la hauteur de l’immeuble pour l’étage du logement', () => {
    const { listing } = parseDetailPage(
      page('<li class="list_item">2 étage(s)</li>'),
      URL,
      'Agence',
    );
    expect(listing?.extra?.['etage']).toBeUndefined();
    const normalized = normalizeListing(listing as NonNullable<typeof listing>, {
      sourceId: 'hektor-test',
      nowMs: Date.parse('2026-09-16T12:00:00Z'),
    });
    expect(normalized?.features).not.toContain('2e étage');
  });

  it('lit le téléphone et l’e-mail de l’agence, espaces du gabarit compris', () => {
    const footer = `<a href="tel:   06 00 00 00 43" class="text__element phone"> 06 00 00 00 43</a>
      <a href="mailto:contact@example.invalid" class="text__element mail">contact@example.invalid</a>`;
    const { listing } = parseDetailPage(page(items, footer), URL, 'Agence');
    expect(listing?.phoneText).toBe('06 00 00 00 43');
    expect(listing?.emailText).toBe('contact@example.invalid');
  });

  it('à défaut de pied de page, l’e-mail vient du JSON-LD de l’agence', () => {
    const ld = `<script type="application/ld+json">${JSON.stringify([
      { '@type': 'RealEstateAgent', name: 'Agence', email: 'agence@example.invalid' },
    ])}</script>`;
    const { listing } = parseDetailPage(page(items, ld), URL, 'Agence');
    expect(listing?.emailText).toBe('agence@example.invalid');
  });
});

describe('parseDetailPage — la référence que l’agence affiche', () => {
  const fiche = readFileSync(join(FIXTURES, 'detail-content-reference.html'), 'utf8');
  const url =
    'https://www.agence-fictive.fr/location/1-nice/studio/358-cama-disponible-le-1er-septembre-2027';

  it('lit « Ref : CAMA » là où l’identifiant d’URL prenait sa place', () => {
    // Relevé du 2026-09-17 : vingt-quatre agences de la plateforme
    // enregistraient le segment de l'adresse (« 358 ») au lieu de la référence
    // affichée. Bien'ici publie « CAMA » : les deux fiches du même logement ne
    // pouvaient pas se reconnaître.
    const { listing } = parseDetailPage(fiche, url, 'Agence Fictive');
    expect(listing?.sourceRef).toBe('358');
    expect(listing?.extra?.['reference']).toBe('CAMA');
  });

  it('n’emprunte pas la référence des annonces voisines', () => {
    const { listing } = parseDetailPage(fiche, url, 'Agence Fictive');
    expect(listing?.extra?.['reference']).not.toBe('AUTRE-BIEN');
  });
});
