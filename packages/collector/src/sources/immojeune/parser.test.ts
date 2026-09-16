import { describe, expect, it } from 'vitest';
import { STUDENT_HOUSING_FEATURE } from '@maioun/shared';
import { fixtureReader } from '../../../../../tests/helpers/fixtures.js';
import { normalizeListing } from '../../normalization/normalize.js';
import { IMMOJEUNE_DESCRIPTOR, listUrls } from './index.js';
import { parseDetail, parseListPage, readAdPath } from './parser.js';

// Pages réelles du 2026-09-16, allégées et anonymisées (titres, adresses, images).
const read = fixtureReader('immojeune');

const LIST_URL = 'https://www.immojeune.com/location-particulier/nice-06.html';

describe('parseListPage', () => {
  const listings = parseListPage(read('liste-nice-particulier.html'), LIST_URL);

  it('retient les locations et les colocations, pas les résidences ni la courte durée', () => {
    // Sur les sept cartes : une résidence, une courte durée et une carte au
    // lien obfusqué restent dehors ; Cannes entre ici et sera écartée plus tard
    // par le périmètre, qui n'est pas l'affaire du parseur.
    expect(listings.map((listing) => listing.sourceRef)).toEqual([
      '4052756',
      '4042018',
      '4041282',
      '4033365',
    ]);
  });

  it('écrit la nature du bailleur que la source déclare, sans la deviner', () => {
    expect(listings[0]?.extra?.['landlord']).toBe('private');
    expect(listings[2]?.extra?.['landlord']).toBe('agency');
  });

  it('déclare la colocation depuis la rubrique et le badge, pas depuis la prose', () => {
    expect(listings[0]?.extra?.['flatShare']).toBe('false');
    expect(listings[1]?.extra?.['flatShare']).toBe('true');
  });

  it('sépare le loyer de la mention des charges que porte le `<sup>`', () => {
    expect(listings[0]?.priceText).toBe('610 € CC');
    expect(listings[0]?.areaText).toBe('40 m²');
  });

  it('prend le code postal et la commune du BIEN', () => {
    expect(listings[1]?.postalCodeText).toBe('06300');
    expect(listings[1]?.cityText).toBe('Nice');
    expect(listings[3]?.cityText).toBe('Cannes');
  });

  it('garde le type de bien, la colocation n’en étant pas un', () => {
    expect(listings[0]?.propertyTypeText).toBe('T2');
    expect(listings[1]?.propertyTypeText).toBe('CHAMBRE');
  });

  it('résout les adresses de fiche en absolu', () => {
    expect(listings[0]?.sourceUrl).toBe(
      'https://www.immojeune.com/location-etudiant/nice-06/deux-pieces-proche-du-marche_4052756.html',
    );
  });

  it('ne décode PAS les liens obfusqués (§10)', () => {
    const decoded = listings.some((listing) => listing.sourceRef === '4032050');
    expect(decoded).toBe(false);
  });
});

describe('parseDetail', () => {
  const draft = parseDetail(read('fiche-4052756.html'));

  it('lit les conditions du pavé de droite', () => {
    expect(draft?.priceText).toBe('610 € CC');
    expect(draft?.areaText).toBe('40 m²');
    expect(draft?.chargesText).toBe('60 €');
    expect(draft?.depositText).toBe('550 €');
  });

  it('laisse les frais de dossier ABSENTS quand la fiche dit « Aucun »', () => {
    // Un champ absent reste absent : « Aucun » n'est pas un montant, et zéro
    // euro de frais n'est pas ce que cette annonce affirme.
    expect(draft?.feesText).toBeUndefined();
  });

  it('sépare l’adresse du bien de sa commune', () => {
    expect(draft?.addressText).toBe('12 Rue des Lauriers');
    expect(draft?.postalCodeText).toBe('06000');
    expect(draft?.cityText).toBe('Nice');
  });

  it('prend le meublé dans les ÉQUIPEMENTS déclarés, pas dans le titre', () => {
    expect(draft?.furnishedText).toBe('Meublé');
    expect(draft?.extra?.['equipements']).toBe('Meublé, Chauffage, Machine à laver');
  });

  it('lit les deux diagnostics sur le nom de leur dessin', () => {
    expect(draft?.extra?.['dpe']).toBe('C');
    expect(draft?.extra?.['ges']).toBe('B');
  });

  it('garde la description entière, repliée comprise', () => {
    expect(draft?.description).toContain('Une place de parking est incluse.');
  });

  it('relève la date de parution et la disponibilité', () => {
    expect(draft?.publishedAtText).toContain('Publiée il y a 1 jour');
    expect(draft?.availableAtText).toBe('Disponible à partir du 17/09/2026');
  });

  it('n’apprend rien d’une annonce partie, que le site sert en accueil', () => {
    // Le site REDIRIGE vers l'accueil en 200 : sans ce refus, la page d'accueil
    // serait lue comme une annonce.
    expect(parseDetail(read('accueil-annonce-partie.html'))).toBeNull();
  });
});

describe('readAdPath', () => {
  it('reconnaît la rubrique, la commune et la référence', () => {
    expect(readAdPath('/colocation/cagnes-sur-mer-06/chambre_4040849.html')).toEqual({
      rubrique: 'colocation',
      commune: 'cagnes-sur-mer-06',
      ref: '4040849',
    });
  });

  it('refuse ce qui n’est pas une annonce', () => {
    expect(readAdPath('/location-etudiant/nice-06')).toBeNull();
    expect(readAdPath('/aide')).toBeNull();
  });
});

describe('listUrls', () => {
  const urls = listUrls();

  it('demande les douze communes du périmètre que le portail connaît', () => {
    // Cap-d'Ail rend 404 (2026-09-16) et n'est donc pas demandée.
    expect(urls.filter((url) => url.endsWith('.html'))).toHaveLength(12);
    expect(urls.some((url) => url.includes('cap-d-ail'))).toBe(false);
  });

  it('écrit la commune suivie de son DÉPARTEMENT, pas de son code postal', () => {
    expect(urls[0]).toBe('https://www.immojeune.com/location-particulier/nice-06.html');
    expect(urls).toContain('https://www.immojeune.com/location-particulier/cagnes-sur-mer-06.html');
  });

  it('ne pagine que Nice, seule commune à remplir plus d’une page', () => {
    expect(urls.filter((url) => /\/\d+$/.test(url))).toEqual([
      'https://www.immojeune.com/location-particulier/nice-06/2',
      'https://www.immojeune.com/location-particulier/nice-06/3',
      'https://www.immojeune.com/location-particulier/nice-06/4',
      'https://www.immojeune.com/location-particulier/nice-06/5',
    ]);
  });
});

describe('IMMOJEUNE_DESCRIPTOR', () => {
  it('ne déclare AUCUNE nature de bailleur : chaque annonce la porte', () => {
    expect(IMMOJEUNE_DESCRIPTOR.landlord).toBeUndefined();
  });

  it('ne marque pas le contact comme payant : la candidature est gratuite', () => {
    expect(IMMOJEUNE_DESCRIPTOR.paidContact).toBeUndefined();
  });
});

describe('une annonce lue de bout en bout', () => {
  const [stub] = parseListPage(read('liste-nice-particulier.html'), LIST_URL);
  const draft = parseDetail(read('fiche-4052756.html'));
  // `enrichNewListings` FUSIONNE `extra` au lieu de le remplacer : la carte y
  // laisse la colocation, la fiche y ajoute les diagnostics.
  const raw = {
    ...stub,
    ...draft,
    sourceRef: stub?.sourceRef ?? '',
    sourceUrl: stub?.sourceUrl ?? '',
    extra: { ...stub?.extra, ...draft?.extra },
  };
  const normalized = normalizeListing(raw, {
    sourceId: IMMOJEUNE_DESCRIPTOR.id,
    nowMs: Date.parse('2026-09-16T08:00:00.000Z'),
  });
  // `normalizeListing` rend `null` pour ce qu'il refuse — un loyer à la nuitée,
  // par exemple. Ici l'annonce doit passer, et l'échec doit se voir tout de suite.
  if (normalized === null) throw new Error('annonce refusée par la normalisation');
  const occurrence = normalized;

  it('range le bailleur du côté des particuliers', () => {
    expect(occurrence.contact.kind).toBe('private');
  });

  it('lit un loyer CHARGES COMPRISES, et le dit', () => {
    expect(occurrence.price).toBe(610);
    expect(occurrence.chargesIncluded).toBe(true);
    expect(occurrence.charges).toBe(60);
  });

  it('ne réserve pas ce deux-pièces ordinaire aux étudiants', () => {
    // Le portail est étudiant, l'annonce ne l'est pas : rien dans son texte ne
    // réserve le logement. Que la rubrique `/location-etudiant/` de l'adresse
    // ne l'exclue pas non plus est vérifié dans `scoring.test.ts`.
    expect(occurrence.features).not.toContain(STUDENT_HOUSING_FEATURE);
  });

  it('n’en fait pas une colocation', () => {
    expect(occurrence.flatShare).toBe(false);
  });

  it('garde meublé, surface, type et diagnostics', () => {
    expect(occurrence.furnished).toBe(true);
    expect(occurrence.area).toBe(40);
    expect(occurrence.propertyType).toBe('apartment');
    expect(occurrence.dpe).toBe('C');
    expect(occurrence.ges).toBe('B');
  });
});
