import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseV2Detail, parseV2List, v2DetailApiUrl } from './v2-parser.js';
import { makeAdaptImmoV2Descriptor } from './v2-scraper.js';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';

// Liste et réponse d'API réelles (Marchal Immobilier) du 2026-09-15, allégées et anonymisées.
const read = fixtureReader('adaptimmo');
const LIST_URL = 'https://www.marchal-immobilier.fr/fr/liste-location?perPage=48&tdp=4';
const AGENCY = 'Marchal Immobilier';

describe('parseV2List (AdaptImmo, nouveau gabarit)', () => {
  const listings = parseV2List(read('v2-liste.html'), LIST_URL, AGENCY);

  it('lit une annonce par entrée du JSON-LD, fiche sur le domaine de la liste', () => {
    expect(listings.map((l) => l.sourceRef)).toHaveLength(7);
    expect(listings[0]?.sourceUrl).toBe(
      'https://www.marchal-immobilier.fr/fr/detail-bien-06024555?idBien=06024555',
    );
    expect(listings[0]?.agencyName).toBe(AGENCY);
  });

  it('extrait loyer hors charges, surface, pièces et commune sans le quartier', () => {
    const first = listings[0];
    expect(first?.priceText).toBe('890 € hors charges');
    expect(first?.areaText).toBe('49 m²');
    expect(first?.roomsText).toBe('2 pièces');
    expect(first?.description).toMatch(/^À louer – Charmant T2 meublé/);
    const carabacel = listings.find((l) => l.sourceRef === '06024309');
    expect(carabacel?.cityText).toBe('Nice');
  });

  it('ne rend rien sans JSON-LD', () => {
    expect(parseV2List('<html><body></body></html>', LIST_URL, AGENCY)).toEqual([]);
  });
});

describe('parseV2Detail (AdaptImmo, nouveau gabarit)', () => {
  const draft = parseV2Detail(read('v2-bien.json'));

  it('vise l’API de la plateforme, groupe par défaut celui de l’agence', () => {
    expect(v2DetailApiUrl('06024555', '06024')).toContain(
      'NUMPDT=06024555&NUMAGE=06024&NUMGROUP=06024',
    );
    expect(v2DetailApiUrl('1', '06024', '06000')).toContain('NUMGROUP=06000');
  });

  it('lit les montants, les photos et la référence', () => {
    expect(draft?.priceText).toBe('890 € hors charges');
    expect(draft?.chargesText).toBe('100 €');
    expect(draft?.depositText).toBe('1780 €');
    expect(draft?.imageUrls).toHaveLength(10);
    expect(draft?.extra).toEqual({ reference: '328', dpe: 'D', ges: 'D' });
    expect(draft?.description).not.toMatch(/Géorisques|<br/);
  });

  it('lit la voie du bien dans `adresse`, jamais celle de l’agence', () => {
    const avec = parseV2Detail(
      JSON.stringify({
        ope: 2,
        prix: '700',
        adresse: '12 avenue Jean Médecin',
        adr_agence: 'Res Toison D Or',
      }),
    );
    expect(avec?.addressText).toBe('12 avenue Jean Médecin');
    // `adresse` vide — le cas courant : on n'invente rien à partir de l'agence.
    expect(
      parseV2Detail(JSON.stringify({ ope: 2, prix: '700', adr_agence: 'Res Toison D Or' }))
        ?.addressText,
    ).toBeUndefined();
  });

  it('prend le quartier dans `quartier_lib`/`quartier`, et rien sinon', () => {
    const nomme = parseV2Detail(
      JSON.stringify({ ope: 2, prix: '700', quartier_lib: 'Carabacel', secteur: 'CENTRE' }),
    );
    expect(nomme?.extra).toMatchObject({ quartier: 'Carabacel' });
  });

  it('se normalise', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '06024555',
        sourceUrl: 'https://www.marchal-immobilier.fr/fr/detail-bien-06024555?idBien=06024555',
        ...draft,
      },
      { sourceId: 'marchal-immobilier', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.price).toBe(890);
    expect(normalized?.charges).toBe(100);
    expect(normalized?.area).toBe(49);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.postalCode).toBe('06100');
  });

  it('refuse une réponse qui n’est pas une location', () => {
    expect(parseV2Detail('{"ope":1,"prix":"250000"}')).toBeNull();
    expect(parseV2Detail('pas du json')).toBeNull();
  });
});

/**
 * Le bien 06024461, signalé mal situé : l'agence le range dans son secteur
 * « CENTRE », sa description l'annonce « NICE NORD - Av Jean Canavese ». La
 * fiche s'affichait au centre-ville, à trois kilomètres de la voie citée.
 */
describe('parseV2Detail — le secteur de l’agence n’est pas le quartier du bien', () => {
  const draft = parseV2Detail(read('v2-bien-secteur-faux.json'));
  const normalized = normalizeListing(
    {
      sourceRef: '06024461',
      sourceUrl: 'https://www.marchal-immobilier.fr/fr/detail-bien-06024461?idBien=06024461',
      ...draft,
    },
    { sourceId: 'marchal-immobilier', nowMs: Date.parse('2026-09-16T12:00:00Z') },
  );

  it('n’annonce aucun quartier que la source ne publie pas', () => {
    expect(draft?.extra).not.toHaveProperty('quartier');
  });

  it('situe le bien où sa description le situe, pas au centre', () => {
    expect(normalized?.district).toBe('Nice Nord');
    expect(normalized?.address).toBe('Av Jean Canavese');
  });

  it('ne pose pas de point sur la carte : les coordonnées sont celles du code postal', () => {
    // 43.7276 / 7.2599 est le centre de 06100 — la réponse les sert à l'identique
    // pour un bien de Libération et pour celui-ci, à l'autre bout du code postal.
    expect(normalized?.latitude).toBeNull();
    expect(normalized?.longitude).toBeNull();
  });
});

describe('makeAdaptImmoV2Descriptor', () => {
  it('autorise la liste et l’API des fiches', () => {
    const descriptor = makeAdaptImmoV2Descriptor({
      id: 'v2-test',
      name: AGENCY,
      domain: 'marchal-immobilier.fr',
      agencyNumber: '06024',
      listUrl: LIST_URL,
    });
    expect(descriptor.allowedPaths).toEqual([
      '/fr/liste-location*',
      'https://reach.adaptimmo.com/mywebsite/bien*',
    ]);
    expect(descriptor.budget.maxPagesPerRun).toBe(9);
  });
});
