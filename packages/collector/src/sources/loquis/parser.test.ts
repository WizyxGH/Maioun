import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { isEmptyList, parseDetail, parseList } from './parser.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Pages réelles du 2026-09-15, allégées. Aucune location publiée : la fiche de
// vente est convertie en location pour éprouver le parseur.
const read = fixtureReader('loquis');

const rental = (): string =>
  read('fiche-vente.html')
    .replace(
      /<span class="listing-price-value" itemprop="price" content="379000">379\.000<\/span>/,
      '<span class="listing-price-value" itemprop="price" content="1150">1.150</span>' +
        '<span class="listing-rental-period">/ mois</span>',
    )
    .replace('Foncier : 1423€', 'Dépôt de garantie : 1 000 €');

describe('parseList (Loquis)', () => {
  it('rend une page vide sans erreur', () => {
    expect(parseList(read('location.html'))).toEqual([]);
  });

  it('reconnaît « aucune annonce ne correspond », absent d’une liste pleine', () => {
    expect(isEmptyList(read('location.html'))).toBe(true);
    expect(isEmptyList(read('vente.html'))).toBe(false);
    expect(isEmptyList('<div class="wpsight-listings-sc"><section></section></div>')).toBe(false);
  });

  it('écarte les ventes et lit les cartes à louer', () => {
    const sale = read('vente.html');
    expect(parseList(sale)).toEqual([]);
    const listings = parseList(
      sale.replaceAll('badge badge-sale', 'badge badge-rent').replaceAll('À vendre', 'À louer'),
    );
    expect(listings).toHaveLength(3);
    expect(listings[0]?.sourceRef).toBe('93185');
    expect(listings[0]?.sourceUrl).toMatch(/^https:\/\/loquis\.fr\/listing\//);
  });
});

describe('parseDetail (Loquis)', () => {
  const draft = parseDetail(rental());

  it('lit loyer, montants et DPE de la description, photos', () => {
    expect(draft?.priceText).toBe('1.150 € / mois');
    expect(draft?.chargesText).toBe('170€');
    expect(draft?.depositText).toBe('1 000 €');
    // Pas de `reference` : elle se devinait dans le nom de fichier d'une photo,
    // et Loquis ne l'affiche nulle part (§17).
    expect(draft?.extra).toEqual({ dpe: 'B' });
    expect(draft?.description).toMatch(/^Venez vite découvrir[\s\S]+DPE: B et B$/);
    expect(draft?.imageUrls).toHaveLength(12);
    expect(draft?.imageUrls?.[0]).toBe(
      'https://loquis.fr/wp-content/uploads/2026/09/picture-87316835-1.jpg',
    );
  });

  it('laisse la normalisation écarter un loyer à la semaine', () => {
    const weekly = parseDetail(rental().replace('/ mois', '/ semaine'));
    expect(weekly?.priceText).toMatch(/semaine/);
    expect(
      normalizeListing(
        { sourceRef: '93152', sourceUrl: 'https://loquis.fr/listing/x/', ...weekly },
        { sourceId: 'loquis', nowMs: Date.parse('2026-09-15T12:00:00Z') },
      ),
    ).toBeNull();
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      { sourceRef: '93152', sourceUrl: 'https://loquis.fr/listing/x/', ...draft },
      { sourceId: 'loquis', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1150);
    expect(normalized?.charges).toBe(170);
    expect(normalized?.deposit).toBe(1000);
    expect(normalized?.area).toBe(62);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBeNull();
    expect(normalized?.dpe).toBe('B');
  });
});

describe('la commune vient du BIEN, jamais de l’agence', () => {
  it('ne pose plus Nice sur une annonce qui ne nomme aucune commune', () => {
    // Le gabarit n'a pas de champ ville et la fiche ne titre qu'un QUARTIER,
    // « CIMIEZ ». « Nice » venait de l'adresse du cabinet : c'était supposer,
    // et le jour où l'agence publie ailleurs tout serait entré à Nice.
    expect(rental()).not.toContain('Nice');
    expect(parseDetail(rental())?.cityText).toBeUndefined();
  });

  it('garde la commune quand l’annonce la nomme, Nice comprise', () => {
    const nicoise = rental().replaceAll('CIMIEZ', 'Nice, quartier Cimiez');
    expect(parseDetail(nicoise)?.cityText).toBe('Nice');
    const voisine = rental().replaceAll('CIMIEZ', 'Cagnes-sur-Mer');
    expect(parseDetail(voisine)?.cityText).toBe('Cagnes-sur-Mer');
  });
});
