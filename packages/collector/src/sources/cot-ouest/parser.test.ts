import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';
import { normalizeListing } from '../../normalization/normalize.js';
import { compactListing } from '../shared/raw-listing.js';
import { COT_OUEST_DESCRIPTOR } from './index.js';
import { parseCotOuestDetail, parseCotOuestList } from './parser.js';

// Pages réelles du 2026-09-16, allégées et anonymisées (négociateur, lignes).
const read = fixtureReader('cot-ouest');

const LIST_URL = 'https://www.cotouest-immobilier.com/toutes-locations.html';

/** Repli si la carte cherchée manque : l'assertion qui suit le dira mieux. */
const EMPTY: RawListing = { sourceRef: '', sourceUrl: '' };

describe('parseCotOuestList', () => {
  const listings = parseCotOuestList(read('toutes-locations.html'), LIST_URL, "Cot'Ouest");

  it('relève les trois locations publiées', () => {
    expect(listings.map((l) => l.sourceRef).sort()).toEqual(['308L1M', '308L282A', '308L286A']);
  });

  it('prend commune, quartier et position sur la carte, que la fiche tait', () => {
    const fleurie = listings.find((l) => l.sourceRef === '308L286A');
    expect(fleurie?.cityText).toBe('Nice');
    expect(fleurie?.extra?.['quartier']).toBe('Corniche fleurie');
    expect(fleurie?.latitude).toBeCloseTo(43.6931, 4);
    expect(fleurie?.longitude).toBeCloseTo(7.2062, 4);
  });

  it('lit aussi bien un degré à la virgule qu’au point', () => {
    // Nice est saisi « 43,6820 », la Corse « 41.67969 » : même site, deux formes.
    expect(listings.find((l) => l.sourceRef === '308L1M')?.latitude).toBeCloseTo(41.67969, 5);
  });

  it('ne reprend PAS le loyer de la carte', () => {
    // Il ferait rendre une saisonnière à la semaine comme un loyer mensuel.
    expect(listings.every((l) => l.priceText === undefined)).toBe(true);
  });
});

describe('parseCotOuestDetail', () => {
  const draft = parseCotOuestDetail(read('fiche-308L286A.html'));

  it('lit les phrases de montants engendrées par Twimmo', () => {
    expect(draft?.priceText).toBe('1 550 € CC par mois');
    expect(draft?.chargesText).toBe('180 €');
    expect(draft?.feesText).toBe('870 €');
    expect(draft?.depositText).toBe('1 500 €');
  });

  it('retrouve la description et le code postal que l’habillage déplace', () => {
    expect(draft?.description).toContain('Superbe F3 de 66');
    expect(draft?.description).toContain('Dépôt de garantie');
    expect(draft?.postalCodeText).toBe('06200');
  });

  it('lit le GES sous son intitulé long, à côté du DPE', () => {
    expect(draft?.extra).toEqual({ dpe: 'C', ges: 'C' });
  });

  it('garde la ligne directe du négociateur et les photos', () => {
    expect(draft?.phoneText).toBe('06 00 00 00 11');
    expect(draft?.imageUrls).toHaveLength(12);
  });

  it('donne, carte et fiche réunies, une annonce normalisable', () => {
    const stubs = parseCotOuestList(read('toutes-locations.html'), LIST_URL, "Cot'Ouest");
    const stub = stubs.find((l) => l.sourceRef === '308L286A') ?? EMPTY;
    // Ce que fait `enrichNewListings` : la fiche prime, mais un champ qu'elle
    // ne dit pas laisse celui de la carte en place, et `extra` se fusionne.
    const normalized = normalizeListing(
      {
        ...stub,
        ...compactListing(draft ?? {}),
        extra: { ...stub.extra, ...draft?.extra },
      },
      { sourceId: COT_OUEST_DESCRIPTOR.id, nowMs: Date.parse('2026-09-16T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1550);
    expect(normalized?.charges).toBe(180);
    expect(normalized?.area).toBe(66);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.postalCode).toBe('06200');
    expect(normalized?.district).toBe('Corniche fleurie');
    expect(normalized?.latitude).toBeCloseTo(43.6931, 4);
    expect(normalized?.dpe).toBe('C');
    expect(normalized?.ges).toBe('C');
  });
});
