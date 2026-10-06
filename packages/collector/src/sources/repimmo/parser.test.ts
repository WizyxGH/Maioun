import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { LIST_URL, nextPage, parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et fiches réelles du 2026-10-06, allégées et anonymisées.
const read = fixtureReader('repimmo');

describe('parseList (Repimmo)', () => {
  const listings = parseList(read('liste.html'));

  it('lit les dix cartes de la page', () => {
    expect(listings).toHaveLength(10);
    expect(new Set(listings.map((one) => one.sourceRef)).size).toBe(10);
  });

  it('garde la rue, le loyer, la surface et la nature de l’annonceur', () => {
    const carte = listings.find((one) => one.sourceRef === '19403556');
    expect(carte).toMatchObject({
      sourceUrl:
        'http://www.repimmo.com/petite_annonces_immobiliere/19403556/appartement-location-nice-06.php',
      priceText: '500 €/mois',
      areaText: '40 m2',
      roomsText: '2',
      cityText: 'Nice',
      postalCodeText: '06000',
      addressText: 'rue Pastorelli',
      publishedAtText: '06/10/2026',
      extra: { landlord: 'private' },
    });
  });

  it('ne dit pas « particulier » d’une annonce qui ne le dit pas', () => {
    const agence = listings.find((one) => one.sourceRef === '19397445');
    expect(agence?.extra?.['landlord']).toBeUndefined();
  });
});

describe('nextPage (Repimmo)', () => {
  it('suit le lien de la page suivante que publie la pagination', () => {
    expect(nextPage(read('liste.html'), LIST_URL)).toBe(`${LIST_URL}?page=2`);
  });

  it('rend `null` quand la page ne publie pas de suivante', () => {
    expect(nextPage(read('liste.html'), `${LIST_URL}?page=9`)).toBeNull();
  });
});

describe('parseDetail (Repimmo)', () => {
  it('lit la fiche d’un particulier : charges, DPE, équipements, photos, nom', () => {
    const draft = parseDetail(read('fiche-particulier.html'));
    expect(draft).toMatchObject({
      priceText: '500 €/mois',
      chargesText: '50 €',
      addressText: 'rue Pastorelli',
      postalCodeText: '06000',
      contactName: 'Mr Exemple',
      publishedAtText: '2026-10-06T08:10:33+02:00',
    });
    expect(draft?.extra).toMatchObject({ dpe: 'C', ges: 'C', landlord: 'private' });
    expect(draft?.extra?.['features']).toContain('cuisine équipée');
    // Les photos en grand, pas les vignettes.
    expect(draft?.imageUrls).toHaveLength(5);
    expect(draft?.imageUrls?.[0]).toBe(
      'http://www.repimmo.com/upload/global/photos/b2368/maison_media_19403556_72730090.jpg',
    );
    // Un particulier n'a pas de téléphone en clair : on n'en invente pas.
    expect(draft?.phoneText).toBeUndefined();
  });

  it('lit la fiche d’une agence : nom, téléphones en clair, référence d’agence', () => {
    const draft = parseDetail(read('fiche-agence.html'));
    expect(draft).toMatchObject({
      agencyName: 'AGENCE EXEMPLE',
      phoneText: '06.00.00.00.01',
      otherPhonesText: ['06.00.00.00.02'],
      chargesText: '150 €',
    });
    expect(draft?.extra).toMatchObject({ reference: '83763552E', dpe: 'C', ges: 'A' });
    expect(draft?.extra?.['landlord']).toBe('agency');
    // Pas de « secteur » sur cette fiche : aucune adresse.
    expect(draft?.addressText).toBeUndefined();
  });

  it('refuse une page qui n’est pas une location', () => {
    expect(parseDetail('<html><body><h1>Vente Maison Nice</h1></body></html>')).toBeNull();
  });

  it('se normalise : rue, charges, DPE et annonceur arrivent sur l’annonce', () => {
    const [carte] = parseList(read('liste.html')).filter((one) => one.sourceRef === '19403556');
    const draft = parseDetail(read('fiche-particulier.html'));
    const listing = normalizeListing(
      { ...carte!, ...draft, extra: { ...carte?.extra, ...draft?.extra } } as never,
      { sourceId: 'repimmo', nowMs: Date.parse('2026-10-06T10:00:00Z') },
    );
    expect(listing?.price).toBe(500);
    expect(listing?.charges).toBe(50);
    expect(listing?.area).toBe(40);
    expect(listing?.rooms).toBe(2);
    expect(listing?.dpe).toBe('C');
    expect(listing?.furnished).toBe(true);
    expect(listing?.address).toMatch(/Pastorelli/i);
    expect(listing?.postalCode).toBe('06000');
  });
});
