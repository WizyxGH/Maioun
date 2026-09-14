import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import {
  extractAddress,
  parseAgencies,
  parseAgencyByReference,
  parseApplicationOverview,
  parseDetail,
  parseListingUrl,
  parseSearchPage,
  parseWithdrawn,
} from './parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/foncia');
const PAGE_URL = 'https://fr.foncia.com/location/nice-06000/appartement';

const nominal = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');

describe('parseListingUrl', () => {
  it('décompose une URL de fiche', () => {
    const parsed = parseListingUrl(
      'https://fr.foncia.com/location/nice-06/appartement/900100001.htm',
    );
    expect(parsed?.reference).toBe('900100001');
    expect(parsed?.citySlug).toBe('nice-06');
  });

  it('rejette les pages de liste', () => {
    expect(parseListingUrl('https://fr.foncia.com/location/nice-06000/appartement')).toBeNull();
  });
});

describe('extractAddress', () => {
  it("isole l'adresse entre le tiret et « Ville CP »", () => {
    expect(
      extractAddress('Location Appartement 2 pièces 40.1 m² - 260 BOULEVARD FICTIF Nice 06200'),
    ).toBe('260 BOULEVARD FICTIF');
  });

  it('conserve une adresse contenant un tiret (numéro à intervalle)', () => {
    // Régression : « 37 - 39 RUE … » était tronqué à « 37 » par split[1].
    expect(extractAddress('Location Studio 23.8 m² - 37 - 39 RUE CLEMENT ROASSAL Nice 06000')).toBe(
      '37 - 39 RUE CLEMENT ROASSAL',
    );
    expect(extractAddress('Location Studio 18.39 m² - 6-8 RUE ABBE SALVETTI Nice 06300')).toBe(
      '6-8 RUE ABBE SALVETTI',
    );
  });

  it('rend undefined quand le titre n’a que la ville et le code postal', () => {
    // « Nice 06300 » n'est pas une adresse : à ne pas confondre avec une voie.
    expect(extractAddress('Location Appartement 45 m² - Nice 06300')).toBeUndefined();
  });

  it('rend undefined sans tiret séparateur', () => {
    expect(extractAddress('Location Appartement 2 pièces')).toBeUndefined();
  });
});

describe('parseSearchPage — fixture nominale', () => {
  const page = parseSearchPage(nominal, PAGE_URL);

  it('extrait les trois cartes sans warning', () => {
    expect(page.listings).toHaveLength(3);
    expect(page.warnings).toHaveLength(0);
  });

  it('sans <link rel="next">, la page est la dernière', () => {
    expect(page.hasNextPage).toBe(false);
    expect(page.nextPageUrl).toBeNull();
  });

  it("extrait l'annonce complète avec adresse et DPE", () => {
    const listing = page.listings.find((l) => l.sourceRef === '900100001');
    // cheerio concatène <span> et <sup> sans espace — sans incidence métier.
    expect(listing?.priceText).toBe('795 €/ mois CC');
    expect(listing?.areaText).toBe('40,1 m²');
    expect(listing?.roomsText).toBe('2 pièces');
    expect(listing?.addressText).toBe('260 BOULEVARD FICTIF');
    expect(listing?.cityText).toBe('NICE');
    expect(listing?.postalCodeText).toBe('06200');
    expect(listing?.extra?.['dpe']).toBe('C');
  });

  it('omet le prix absent plutôt que de deviner (§17)', () => {
    const noPrice = page.listings.find((l) => l.sourceRef === '900100003');
    expect(noPrice?.priceText).toBeUndefined();
  });
});

describe('parseSearchPage — chaîne complète avec la normalisation', () => {
  const NOW = Date.parse('2026-08-15T12:00:00.000Z');
  const page = parseSearchPage(nominal, PAGE_URL);

  it('lit « 795 € / mois CC » comme charges comprises', () => {
    const listing = page.listings.find((l) => l.sourceRef === '900100001');
    if (listing === undefined) throw new Error('annonce absente');
    const normalized = normalizeListing(listing, { sourceId: 'foncia', nowMs: NOW });
    expect(normalized?.price).toBe(795);
    expect(normalized?.chargesIncluded).toBe(true);
    expect(normalized?.area).toBe(40.1);
    expect(normalized?.address).toBe('260 BOULEVARD FICTIF');
    expect(normalized?.city).toBe('nice');
  });

  it('produit un studio meublé dans les critères', () => {
    const studio = page.listings.find((l) => l.sourceRef === '900100002');
    if (studio === undefined) throw new Error('studio absent');
    const normalized = normalizeListing(studio, { sourceId: 'foncia', nowMs: NOW });
    expect(normalized?.price).toBe(640);
    expect(normalized?.area).toBe(15);
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.propertyType).toBe('studio');
  });
});

describe('parseAgencies (Foncia)', () => {
  const html = readFileSync(join(FIXTURES, 'agences.html'), 'utf8');

  it('lit nom, téléphone et e-mail de chaque agence', () => {
    const agencies = parseAgencies(html);
    expect(agencies.get('3443')).toEqual({
      name: 'Foncia Nice Résidences',
      phone: '+33400000002',
      email: 'agence-b-location@example.invalid',
    });
  });

  it('garde une agence sans coordonnées plutôt que de l’écarter (§17)', () => {
    const agency = parseAgencies(html).get('9999');
    expect(agency?.name).toBe('Agence sans contact');
    expect(agency?.phone).toBeUndefined();
    expect(agency?.email).toBeUndefined();
  });
});

describe('parseAgencyByReference (Foncia)', () => {
  it('relie chaque annonce à son agence', () => {
    const html = readFileSync(join(FIXTURES, 'liste-agences.html'), 'utf8');
    const map = parseAgencyByReference(html);
    expect(map.get('331706221')).toBe('3443');
    // Certaines annonces relèvent d'une agence absente de la page de la ville :
    // elles gardent alors le formulaire, sans contact direct.
    expect(map.get('331707068')).toBe('6674');
  });
});

describe('parseWithdrawn (Foncia)', () => {
  const read = (name: string): string =>
    readFileSync(
      fileURLToPath(new URL(`../../../../../tests/fixtures/foncia/${name}`, import.meta.url)),
      'utf8',
    );

  it('reconnaît une fiche retirée : bandeau et statut « deleted »', () => {
    expect(parseWithdrawn(read('fiche-retiree.html'), '331707068')).toBe(true);
  });

  it('laisse tranquille une fiche encore ouverte à candidature', () => {
    expect(parseWithdrawn(read('fiche-active.html'), '330719254')).toBe(false);
  });

  it('ne confond pas le statut d’une autre entrée de l’état de transfert', () => {
    // La fiche active embarque aussi l'agence, avec son propre `status`.
    // Le découpage par clé doit isoler celui de l'annonce demandée.
    expect(parseWithdrawn(read('fiche-active.html'), '999999999')).toBe(false);
  });

  it('ne conclut rien d’une page vide (§17)', () => {
    expect(parseWithdrawn('<html><body></body></html>', '331707068')).toBe(false);
  });
});

describe('parseDetail (Foncia)', () => {
  const FICHE = readFileSync(
    fileURLToPath(
      new URL('../../../../../tests/fixtures/foncia/fiche-description.html', import.meta.url),
    ),
    'utf8',
  );

  it('récupère la description entière, retours à la ligne compris', () => {
    const detail = parseDetail(FICHE, '330719254');
    expect(detail?.description).toContain('IMMEUBLE BOURGEOIS');
    expect(detail?.description).toContain('Foncia Développement');
    // Le `<br>` de la source devient un vrai retour à la ligne.
    expect((detail?.description ?? '').split('\n').length).toBeGreaterThan(1);
  });

  it('ne prend pas la description d’une AUTRE entrée de l’état de transfert', () => {
    // La fiche embarque aussi l'agence, qui a sa propre `description`.
    expect(parseDetail(FICHE, '999999999')).toBeNull();
  });

  it('ne conclut rien d’une page vide (§17)', () => {
    expect(parseDetail('<html><body></body></html>', '330719254')).toBeNull();
  });
});

describe('parseSearchPage — pagination (Foncia)', () => {
  const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

  it('suit <link rel="next"> et lit le total annoncé', () => {
    const page = parseSearchPage(read('liste-page1.html'), PAGE_URL);
    expect(page.nextPageUrl).toBe('https://fr.foncia.com/location/nice-06/appartement/page-2');
    expect(page.hasNextPage).toBe(true);
    expect(page.total).toBe(3);
  });

  it('s’arrête sur la dernière page', () => {
    const page = parseSearchPage(read('liste-page2.html'), PAGE_URL);
    expect(page.nextPageUrl).toBeNull();
    expect(page.listings.map((l) => l.sourceRef)).toEqual(['900200003']);
  });

  it('ne suit pas une page suivante à paramètres (robots.txt)', () => {
    const html =
      '<html><head><link rel="next" href="/location/nice-06/appartement?page=2"></head></html>';
    expect(parseSearchPage(html, PAGE_URL).nextPageUrl).toBeNull();
  });
});

describe('parseApplicationOverview (Foncia)', () => {
  const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

  it('complet : dossiers actifs au plafond de l’agence', () => {
    expect(parseApplicationOverview(read('overview-full.json'))).toEqual({
      rented: false,
      applications: 'full',
    });
  });

  it('ouvert : sous le plafond', () => {
    expect(parseApplicationOverview(read('overview-open.json'))).toEqual({
      rented: false,
      applications: 'open',
    });
  });

  it('loué : prime sur le compteur', () => {
    expect(parseApplicationOverview(read('overview-rented.json'))).toEqual({
      rented: true,
      applications: null,
    });
  });

  it('agence sans candidature en ligne : rien à dire, même au plafond', () => {
    expect(parseApplicationOverview(read('overview-disabled.json'))).toEqual({
      rented: false,
      applications: null,
    });
  });

  it('`rented` absent vaut non loué', () => {
    const json =
      '{"id":"1","activeApplicationsCount":1,"agency":{"id":"3443","enabled":true,"max":2}}';
    expect(parseApplicationOverview(json)).toEqual({ rented: false, applications: 'open' });
  });

  it('ne conclut rien d’un JSON invalide ou d’une forme inattendue', () => {
    expect(parseApplicationOverview('<html>erreur</html>')).toBeNull();
    expect(parseApplicationOverview('null')).toBeNull();
    expect(parseApplicationOverview('{"activeApplicationsCount":2,"rented":false}')).toBeNull();
    expect(
      parseApplicationOverview(
        '{"activeApplicationsCount":"2","rented":false,"agency":{"enabled":true,"max":2}}',
      ),
    ).toBeNull();
    expect(
      parseApplicationOverview(
        '{"activeApplicationsCount":2,"rented":"non","agency":{"enabled":true,"max":2}}',
      ),
    ).toBeNull();
    expect(
      parseApplicationOverview('{"activeApplicationsCount":2,"agency":{"enabled":1,"max":2}}'),
    ).toBeNull();
  });
});
