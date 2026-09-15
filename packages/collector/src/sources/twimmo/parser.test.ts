import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseTwimmoDetail, parseTwimmoList } from './parser.js';
import { makeTwimmoDescriptor, twimmoListUrl } from './scraper.js';

// Listes et fiches réelles (MK Immo le 2026-09-14, Elitimo le 2026-09-15), allégées.
const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/twimmo');
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const MK_LIST = 'https://www.mk-immo.fr/toutes-locations.html';
const ELITIMO_LIST = 'https://www.elitimo.com/toutes-locations.html';

describe('parseTwimmoList', () => {
  it('extrait les dix locations de MK Immo par leur référence', () => {
    const listings = parseTwimmoList(read('mk-immo/toutes-locations.html'), MK_LIST, 'MK Immo');
    expect(listings).toHaveLength(10);
    expect(listings.map((l) => l.sourceRef)).toContain('795L1111A');
    expect(listings[0]?.sourceUrl).toMatch(/^https:\/\/www\.mk-immo\.fr\/.+-795l28p\.html$/);
    expect(listings[0]?.agencyName).toBe('MK Immo');
  });

  it('extrait les quatre locations d’Elitimo par leur référence', () => {
    const listings = parseTwimmoList(
      read('elitimo/toutes-locations.html'),
      ELITIMO_LIST,
      'Elitimo',
    );
    expect(listings.map((l) => l.sourceRef).sort()).toEqual([
      '1062L29A',
      '1062L34A',
      '1062L429A',
      '1062L439A',
    ]);
    expect(listings[0]?.sourceUrl).toMatch(/^https:\/\/www\.elitimo\.com\/location-.+\.html$/);
  });

  it('déduit l’origine du site de l’adresse de liste', () => {
    const html =
      '<a href="https://agence.example/location-studio-nice-1-12l3a.html">absolu</a>' +
      '<a href="/location-t2-nice-1-12l4b.html">relatif</a>' +
      '<a href="https://ailleurs.example/location-t3-nice-1-12l5c.html">autre site</a>';
    const listings = parseTwimmoList(html, 'https://agence.example/toutes-locations.html', 'X');
    expect(listings.map((l) => l.sourceUrl)).toEqual([
      'https://agence.example/location-studio-nice-1-12l3a.html',
      'https://agence.example/location-t2-nice-1-12l4b.html',
    ]);
  });
});

describe('makeTwimmoDescriptor', () => {
  it('déduit domaine et liste de l’origine', () => {
    const config = { id: 'x', name: 'X', siteUrl: 'https://www.agence.example' };
    expect(makeTwimmoDescriptor(config).domain).toBe('agence.example');
    expect(twimmoListUrl(config)).toBe('https://www.agence.example/toutes-locations.html');
  });
});

describe('parseTwimmoDetail', () => {
  it('lit les phrases de montants engendrées (MK Immo)', () => {
    const draft = parseTwimmoDetail(read('mk-immo/fiche-795L1111A.html'));
    expect(draft?.priceText).toBe('1 190 € CC par mois');
    expect(draft?.chargesText).toBe('200 €');
    expect(draft?.feesText).toBe('455 €');
    expect(draft?.depositText).toBe('1 980 €');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06100');
    expect(draft?.extra).toEqual({ dpe: 'C' });
    expect(draft?.imageUrls?.[0]).toMatch(/^https:\/\/medias\.twimmopro\.com\//);

    const normalized = normalizeListing(
      {
        sourceRef: '795L1111A',
        sourceUrl: 'https://www.mk-immo.fr/appartement+nice+centre+ville-1-795l1111a.html',
        ...draft,
      },
      { sourceId: 'mk-immo', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1190);
    expect(normalized?.charges).toBe(200);
    expect(normalized?.area).toBe(35);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('C');
  });

  it('lit la fiche Elitimo', () => {
    const draft = parseTwimmoDetail(read('elitimo/fiche-1062L29A.html'));
    expect(draft?.priceText).toBe('1 500 € CC par mois');
    expect(draft?.chargesText).toBe('100 €');
    expect(draft?.feesText).toBe('727 €');
    expect(draft?.depositText).toBe('1 400 €');
    expect(draft?.cityText).toBe('Nice');
    expect(draft?.postalCodeText).toBe('06000');
    expect(draft?.description).toMatch(
      /^Au cœur du Carré d'or de Nice[\s\S]+Appartement climatisé\.$/,
    );
    expect(draft?.imageUrls).toHaveLength(17);

    const normalized = normalizeListing(
      {
        sourceRef: '1062L29A',
        sourceUrl:
          'https://www.elitimo.com/location-appartement-3-pieces-nice-carre-d-or-1-1062l29a.html',
        ...draft,
      },
      { sourceId: 'elitimo', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1500);
    expect(normalized?.area).toBe(55);
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.dpe).toBe('D');
  });

  it('refuse une fiche sans loyer mensuel', () => {
    expect(parseTwimmoDetail('<html><body>Vente appartement 250 000 €</body></html>')).toBeNull();
  });
});
