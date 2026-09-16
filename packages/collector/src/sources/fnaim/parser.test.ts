import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import {
  listUrl,
  parseCharacteristics,
  parseDetail,
  parseListPage,
  SEARCHES,
  splitTitle,
} from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/fnaim/${name}`, import.meta.url)),
    'utf8',
  );

const HTML = fixture('liste.html');
const NICE = SEARCHES[0]!;
const PAGE = listUrl(NICE, 1);

describe('SEARCHES (FNAIM)', () => {
  it('couvre les treize communes suivies et les maisons du département', () => {
    // Le périmètre du projet : Nice et douze communes en continuité.
    expect(SEARCHES.filter((search) => search.slug.includes('appartement'))).toHaveLength(13);
    expect(SEARCHES.filter((search) => search.beyondPerimeter === true)).toEqual([
      { slug: '18-location-maison-alpes-maritimes-06', beyondPerimeter: true },
    ]);
  });

  it('écrit les communes comme le portail les écrit, pas comme nous', () => {
    // « saint-laurent-du-var » renvoie la page d'accueil : huit annonces
    // manquaient sans le moindre signe.
    const slugs = SEARCHES.map((search) => search.slug);
    expect(slugs).toContain('18-location-appartement-st-laurent-du-var-06700');
    expect(slugs).toContain('18-location-appartement-st-andre-06730');
    expect(slugs.filter((slug) => slug.includes('saint-'))).toEqual([]);
  });

  /**
   * LA LISTE ENTIÈRE, FIGÉE. Ces adresses sont celles que le portail honore ;
   * une seule qu'il ne reconnaît pas et il sert son accueil, en 200 et sans
   * annonce. Le test échoue donc si la fabrique change d'écriture — et il dit
   * du même coup quelles communes sont demandées.
   */
  it('construit exactement ces adresses', () => {
    expect(SEARCHES.map((search) => listUrl(search, 1))).toEqual([
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-nice-06000.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-st-laurent-du-var-06700.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-cagnes-sur-mer-06800.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-villeneuve-loubet-06270.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-beaulieu-sur-mer-06310.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-cap-d-ail-06320.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-villefranche-sur-mer-06230.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-la-trinite-06340.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-st-andre-06730.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-drap-06340.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-carros-06510.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-contes-06390.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-colomars-06670.htm',
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-maison-alpes-maritimes-06.htm',
    ]);
  });
});

describe('listUrl (FNAIM)', () => {
  it('utilise la pagination SEO, sans querystring', () => {
    expect(listUrl(NICE, 1)).toBe(
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-nice-06000.htm',
    );
    expect(listUrl(NICE, 3)).toBe(
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-nice-06000-page-3.htm',
    );
  });
});

describe('splitTitle (FNAIM)', () => {
  it('décompose le titre canonique', () => {
    expect(splitTitle('Appartement 1 pièce 23m² NICE 06200')).toEqual({
      propertyType: 'Appartement',
      rooms: '1 pièce',
      area: '23m²',
      city: 'NICE',
      postalCode: '06200',
    });
  });

  it('lit le meublé que le portail glisse après les pièces', () => {
    expect(splitTitle('Appartement 2 pièces Meublé  49m² NICE 06000')).toEqual({
      propertyType: 'Appartement',
      rooms: '2 pièces',
      furnished: 'Meublé',
      area: '49m²',
      city: 'NICE',
      postalCode: '06000',
    });
  });

  it('garde ce qu’il y a quand la surface manque', () => {
    expect(splitTitle('Maison 4 pièces NICE 06300')).toEqual({
      propertyType: 'Maison',
      rooms: '4 pièces',
      city: 'NICE',
      postalCode: '06300',
    });
  });

  it('garde ce qu’il y a quand la commune manque', () => {
    expect(splitTitle('Appartement 2 pièces 57m²')).toEqual({
      propertyType: 'Appartement',
      rooms: '2 pièces',
      area: '57m²',
    });
  });

  it('ne devine rien d’un titre d’une autre forme (§17)', () => {
    expect(splitTitle('Bel appartement à louer')).toEqual({});
  });
});

describe('parseListPage (FNAIM)', () => {
  const page = parseListPage(HTML, PAGE);

  it('lit chaque carte sans avertissement', () => {
    expect(page.listings).toHaveLength(5);
    expect(page.warnings).toEqual([]);
    expect(page.hasNext).toBe(true);
    expect(page.recognized).toBe(true);
  });

  it('lit le meublé du titre, que le filtre « non meublé » attendait', () => {
    const meuble = page.listings.find((listing) => listing.sourceRef === '53200001');
    expect(meuble?.furnishedText).toBe('Meublé');
    expect(meuble?.areaText).toBe('49m²');
    expect(meuble?.roomsText).toBe('2 pièces');
    expect(normalizeListing(meuble!, { sourceId: 'fnaim', nowMs: 0 })?.furnished).toBe(true);
  });

  it('tient la commune d’un titre qui ne la porte pas', () => {
    // Le lieu publié sous la carte, lui, est toujours là.
    const sansLieu = page.listings.find((listing) => listing.sourceRef === '53200003');
    expect(sansLieu?.cityText).toBe('NICE');
    expect(sansLieu?.postalCodeText).toBe('06200');
    expect(sansLieu?.areaText).toBe('57m²');
  });

  it('garde les pièces et le type d’un titre sans surface', () => {
    const sansSurface = page.listings.find((listing) => listing.sourceRef === '53200002');
    expect(sansSurface?.roomsText).toBe('3 pièces');
    expect(sansSurface?.propertyTypeText).toBe('Appartement');
    expect(sansSurface?.areaText).toBeUndefined();
    expect(sansSurface?.cityText).toBe('NICE');
  });

  it('s’arrête à la dernière page, qui n’a plus de « Page suivante »', () => {
    // Les liens vers les pages PRÉCÉDENTES y restent, `-page-N` compris :
    // les compter demandait chaque fois une page vide de plus.
    const derniere = parseListPage(HTML.replace(' title="Page suivante"', ''), PAGE);
    expect(derniere.hasNext).toBe(false);
    expect(HTML).toContain('-page-2.htm');
  });

  it('signale la page d’accueil servie pour une recherche inconnue', () => {
    const accueil = parseListPage(fixture('recherche-inconnue.html'), PAGE);
    expect(accueil.recognized).toBe(false);
    expect(accueil.listings).toEqual([]);
  });

  it('ne garde des maisons du département que les communes suivies', () => {
    const maisons = parseListPage(fixture('maisons-departement.html'), PAGE, {
      slug: '18-location-maison-alpes-maritimes-06',
      beyondPerimeter: true,
    });
    expect(maisons.listings.map((listing) => listing.cityText)).toEqual(['NICE', 'CAGNES SUR MER']);
  });

  it('lit les faits, l’agence et son téléphone', () => {
    const listing = page.listings[1];
    expect(listing?.sourceRef).toBe('53157237');
    expect(listing?.sourceUrl).toBe(
      'https://www.fnaim.fr/annonce-immobiliere/53157237/18-location-appartement-nice-06200.htm',
    );
    expect(listing?.priceText).toContain('646');
    expect(listing?.areaText).toBe('23m²');
    expect(listing?.roomsText).toBe('1 pièce');
    expect(listing?.cityText).toBe('NICE');
    expect(listing?.postalCodeText).toBe('06200');
    expect(listing?.agencyName).toBeTruthy();
    expect(listing?.phoneText).toBe('06 00 00 00 01');
    expect(listing?.extra?.['features']).toContain('Ascenseur');
  });

  it('garde la description avec ses retours à la ligne — l’adresse y est', () => {
    const description = page.listings[1]?.description ?? '';
    expect(description.split('\n').length).toBeGreaterThan(2);
    expect(description).toContain('CORNICHE FLEURIE');
  });

  it('ne prend pas « Nous consulter » pour un loyer (§17)', () => {
    expect(page.listings[0]?.priceText).toBeUndefined();
  });

  it('joint les photos, la principale et les suivantes', () => {
    const images = page.listings[0]?.imageUrls ?? [];
    expect(images.length).toBeGreaterThan(1);
    expect(images[0]).toMatch(/^https:\/\/imagesv2\.fnaim\.fr\//);
  });

  it('se normalise en une annonce exploitable, adresse comprise', () => {
    const normalized = normalizeListing(page.listings[1]!, { sourceId: 'fnaim', nowMs: 0 });
    expect(normalized?.price).toBe(646);
    expect(normalized?.area).toBe(23);
    expect(normalized?.rooms).toBe(1);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.postalCode).toBe('06200');
    expect(normalized?.propertyType).toBe('apartment');
    expect(normalized?.contact.phone).toBeTruthy();
  });

  it('ne rend rien d’une page sans annonce, sans lever d’erreur (§69)', () => {
    const empty = parseListPage('<html><body><ul></ul></body></html>', PAGE);
    expect(empty.listings).toEqual([]);
    expect(empty.hasNext).toBe(false);
  });
});

describe('parseDetail (FNAIM)', () => {
  const FICHE = readFileSync(
    fileURLToPath(new URL('../../../../../tests/fixtures/fnaim/fiche.html', import.meta.url)),
    'utf8',
  );

  it('récupère la description ENTIÈRE que la carte coupait', () => {
    const detail = parseDetail(FICHE);
    const carte = parseListPage(HTML, PAGE).listings[1]?.description ?? '';
    expect(detail?.description).toBeDefined();
    expect(detail!.description!.length).toBeGreaterThan(carte.length * 3);
    // Ce que la troncature emportait : les conditions, et l'adresse.
    expect(detail?.description).toContain('CORNICHE FLEURIE');
    expect(detail?.description).toContain('honoraires charge locataire');
  });

  it('garde les retours à la ligne du texte', () => {
    expect((parseDetail(FICHE)?.description ?? '').split('\n').length).toBeGreaterThan(2);
  });

  it('ne conclut rien d’une page sans description (§17)', () => {
    expect(parseDetail('<html><body><p>rien</p></body></html>')).toBeNull();
  });
});

describe('parseCharacteristics', () => {
  const page = (body: string): string => `<html><body>${body}</body></html>`;

  it('lit les couples intitulé / valeur', () => {
    const html = page(`<div class="caracteristique">
      <ul><li><span>Type d'habitation&nbsp;: </span> Appartement</li>
          <li><span>Surface habitable&nbsp;: </span> 16 m²</li></ul></div>`);
    expect(parseCharacteristics(html)).toBe(
      "Type d'habitation : Appartement · Surface habitable : 16 m²",
    );
  });

  it('ÉCARTE les « Non » — sans quoi on inventerait un balcon', () => {
    // La normalisation cherche le MOT « balcon » dans ce texte : recopier
    // « Balcon : Non » y ferait apparaître un balcon que l'annonce dit ne pas
    // avoir. On déduirait un équipement de son absence (§17).
    const html = page(`<div class="caracteristique">
      <ul><li><span>Balcon&nbsp;: </span> Non</li>
          <li><span>Terrasse&nbsp;: </span> Non</li>
          <li><span>Ascenseur&nbsp;: </span> Non</li></ul></div>`);
    expect(parseCharacteristics(html)).toBeUndefined();
  });

  it('réduit un « Oui » à son intitulé', () => {
    // « Ascenseur » se lit ; « Ascenseur : Oui » ne se lit pas mieux.
    const html = page(`<div class="caracteristique">
      <ul><li><span>Ascenseur&nbsp;: </span> Oui</li></ul></div>`);
    expect(parseCharacteristics(html)).toBe('Ascenseur');
  });

  it('ignore une fiche sans tableau', () => {
    expect(parseCharacteristics(page('<p>rien</p>'))).toBeUndefined();
  });
});
