import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { barnesScraper } from './index.js';
import { detailUrl, isEmptyList, LIST_URL, parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';
import { contextServing } from '../../../../../tests/helpers/scrape-context.js';

// Pages réelles du 2026-09-15, allégées et anonymisées : liste des
// Alpes-Maritimes, recherche Nice sans résultat, une fiche louée au mois
// (Paris) et une à prix sur demande (Roquebrune-Cap-Martin).
const read = fixtureReader('barnes');

const ROQUEBRUNE =
  'https://www.barnes-international.com/fr/location/france/roquebrune-cap-martin/ref-ITB-LS104-2.html';

describe('parseList (BARNES)', () => {
  const listings = parseList(read('location-alpes-maritimes.html'));

  it('lit la carte des résultats, pas celles « pourraient vous intéresser »', () => {
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      sourceRef: 'ITB-LS104-2',
      sourceUrl: ROQUEBRUNE,
      title: 'À louer Maison | Roquebrune-Cap-Martin',
      propertyTypeText: 'Maison',
      areaText: '363 m²',
      cityText: 'Roquebrune-Cap-Martin',
      // La liste ne publie pas de référence : l'identifiant d'URL sert de
      // `sourceRef`, la référence viendra du tableau de la fiche.
      extra: { communeSlug: 'roquebrune-cap-martin' },
    });
    expect(listings[0]?.priceText).toBeUndefined();
  });

  it('ne lit que les fiches des communes de la zone', () => {
    expect(detailUrl(listings[0] as RawListing)).toBeNull();
    const nice = ROQUEBRUNE.replace('roquebrune-cap-martin', 'nice');
    expect(detailUrl({ sourceRef: 'x', sourceUrl: nice })).toBe(nice);
  });

  it('reconnaît la liste vide affichée', () => {
    expect(parseList(read('location-nice-vide.html'))).toEqual([]);
    expect(isEmptyList(read('location-nice-vide.html'))).toBe(true);
    expect(isEmptyList(read('location-alpes-maritimes.html'))).toBe(false);
    expect(isEmptyList('<html><body></body></html>')).toBe(false);
  });
});

describe('parseDetail (BARNES)', () => {
  const url =
    'https://www.barnes-international.com/fr/location/france/paris-6eme/ref-APM-87323598.html';
  const draft = parseDetail(read('fiche-APM-87323598.html'));

  it('lit le tableau et le texte de la fiche', () => {
    expect(draft).toMatchObject({
      title: 'Paris 6ème, Appartement 4 Chambres - 210 m² en location',
      priceText: '8 060 € / mois CC',
      chargesText: '500 €',
      depositText: '15 120,00 €',
      feesText: '10 886,40 €',
      areaText: '210 m²',
      roomsText: '6 pièces',
      propertyTypeText: 'Appartement',
      cityText: 'Paris 6ème',
      phoneText: '+33600000002',
      extra: {
        reference: 'APM-87323598',
        dpe: 'C',
        etage: '3',
        agence: 'BARNES Rentals Rive Gauche',
      },
    });
    expect(draft?.description).toMatch(/^Rue de l’Ancienne Comédie[\s\S]+CONSULTANT BARNES$/);
    expect(draft?.imageUrls).toHaveLength(2);
    expect(draft?.imageUrls?.[1]).toMatch(/^https:\/\/assets\.barnes-international\.com\/.+\.jpg$/);
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: 'APM-87323598', sourceUrl: url, ...draft },
      { sourceId: 'barnes', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(8060);
    expect(normalized?.area).toBe(210);
    expect(normalized?.rooms).toBe(6);
  });

  it('refuse un prix sur demande', () => {
    expect(parseDetail(read('fiche-ITB-LS104-2.html'))).toBeNull();
  });
});

describe('barnesScraper', () => {
  it('rend `empty` sur « La recherche n’indique aucun résultat »', async () => {
    const result = await barnesScraper.run(
      contextServing({ [LIST_URL]: read('location-nice-vide.html') }),
    );
    expect(result).toMatchObject({ stopReason: 'empty', warnings: [] });
  });

  it('garde l’avertissement sur une page sans résultats ni bandeau', async () => {
    const result = await barnesScraper.run(contextServing({ [LIST_URL]: '<html></html>' }));
    expect(result.stopReason).toBe('completed');
    expect(result.warnings).toHaveLength(1);
  });
});
