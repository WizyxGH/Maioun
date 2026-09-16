/**
 * Ce qu'Oqoro publie, lu sur des pages réduites et anonymisées du 2026-09-16.
 * Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { OQORO_DESCRIPTOR } from './index.js';
import { listUrl, parseBadge, parseDetail, parseListingUrl, parseListPage } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/oqoro/${name}`, import.meta.url)),
    'utf8',
  );

const LISTE = fixture('liste-departement.html');
const FICHE = fixture('fiche.html');
const LIST_URL = listUrl(1);

describe('parseListingUrl', () => {
  it('reconnaît une fiche et en tire la commune et l’identifiant du lot', () => {
    expect(parseListingUrl('/location/nice/t2-24-rue-gounod-0fcb5f72')).toEqual({
      sourceRef: '0fcb5f72',
      commune: 'nice',
      url: 'https://www.oqoro.com/location/nice/t2-24-rue-gounod-0fcb5f72',
    });
    expect(parseListingUrl('/colocation/la-trinite/chambre-1-8-rue-x-1a2b3c4d')?.commune).toBe(
      'la-trinite',
    );
    // Les grandes villes portent leur code postal ; la commune reste la commune.
    expect(parseListingUrl('/location/lyon-69000/t2-1-rue-x-1a2b3c4d')?.commune).toBe('lyon');
  });

  it('écarte ce qui n’est pas une fiche', () => {
    expect(parseListingUrl('/locations/nice')).toBeNull();
    expect(parseListingUrl('/locations-departement/alpes-maritimes/page/2')).toBeNull();
    expect(parseListingUrl('/gestion-locative/nice')).toBeNull();
    expect(parseListingUrl('https://autre.fr/location/nice/t2-1-rue-x-1a2b3c4d')).toBeNull();
  });
});

describe('parseBadge', () => {
  it('distingue les trois états affichés par le site', () => {
    expect(parseBadge('Disponible')).toEqual({ state: 'now' });
    expect(parseBadge('Dispo le 01/10')).toEqual({ state: 'soon', text: 'Dispo le 01/10' });
    expect(parseBadge('Occupé')).toEqual({ state: 'rented' });
    expect(parseBadge('Occupée')).toEqual({ state: 'rented' });
    expect(parseBadge('')).toBeNull();
  });
});

describe('parseListPage', () => {
  const parsed = parseListPage(LISTE, LIST_URL);

  it('ne garde que ce qui se loue, et dans le périmètre', () => {
    expect(parsed.listings.map((one) => one.sourceRef)).toEqual(['1a2b3c4d', '2b3c4d5e']);
    // Le studio occupé et la chambre occupée ne sont pas des offres ; l'annonce
    // disponible de Cannes n'est pas du périmètre.
    expect(parsed.listings.map((one) => one.cityText)).not.toContain('Cannes');
  });

  it('rend louées les références que le site affiche occupées', () => {
    expect([...parsed.rentedRefs].sort()).toEqual(['3c4d5e6f', '5e6f7081']);
  });

  it('compte les cartes une seule fois, malgré le gabarit responsive', () => {
    // Cinq annonces distinctes, dont l'une répétée par le gabarit.
    expect(parsed.cards).toBe(5);
    expect(parsed.warnings).toEqual([]);
  });

  it('lit sur la carte le loyer, la surface, l’adresse exacte et la photo', () => {
    const chambre = parsed.listings[0];
    expect(chambre?.title).toBe('Chambre 1 - colocation meublée');
    expect(chambre?.priceText).toBe('670 € par mois charges comprises');
    expect(chambre?.areaText).toBe('70m²');
    expect(chambre?.addressText).toBe('12 Rue des Alouettes');
    expect(chambre?.cityText).toBe('Nice');
    expect(chambre?.availableAtText).toBe('Disponible');
    expect(chambre?.imageUrls).toEqual(['https://cdn.oqoro.com/exemple0000000000000000001']);
  });

  it('garde la date d’entrée d’un préavis en cours', () => {
    const preavis = parsed.listings[1];
    expect(preavis?.availableAtText).toBe('Dispo le 01/10');
    expect(preavis?.cityText).toBe('Saint-Laurent-du-Var');
  });

  it('signale une page vide plutôt que de la prendre pour une liste', () => {
    const vide = parseListPage('<html><body></body></html>', LIST_URL);
    expect(vide.listings).toEqual([]);
    expect(vide.cards).toBe(0);
    expect(vide.warnings[0]).toContain('Aucune carte');
  });
});

describe('parseDetail', () => {
  const draft = parseDetail(FICHE);

  it('lit les montants que la carte ne donne pas', () => {
    expect(draft?.chargesText).toBe('120 €');
    expect(draft?.depositText).toBe('1 100 €');
    expect(draft?.feesText).toBe('306,13 €');
  });

  it('lit l’adresse, la position et le code postal du JSON-LD', () => {
    expect(draft?.addressText).toBe('12 Rue des Alouettes');
    expect(draft?.postalCodeText).toBe('06300');
    expect(draft?.latitude).toBeCloseTo(43.716676);
    expect(draft?.longitude).toBeCloseTo(7.293631);
    expect(draft?.areaText).toBe('70 m²');
  });

  it('lit les pièces ET les chambres, que le site sépare', () => {
    expect(draft?.roomsText).toBe('T4 3 chambres');
    expect(draft?.furnishedText).toBe('Meublé');
    expect(draft?.propertyTypeText).toBe('Chambre');
  });

  it('lit le DPE et le GES chacun sur son échelle, sans déduire l’un de l’autre', () => {
    expect(draft?.extra?.['dpe']).toBe('E');
    expect(draft?.extra?.['ges']).toBe('D');
  });

  it('garde la référence du gestionnaire, l’étage, les commodités et la part privative', () => {
    expect(draft?.extra?.['reference']).toBe('OQ0000W');
    expect(draft?.extra?.['etage']).toBe('1');
    expect(draft?.extra?.['features']).toBe('Balcon, Internet (Fibre)');
    expect(draft?.extra?.['surfacePrivative']).toBe('10 m²');
  });

  it('nomme le publiant, et ne retient de la galerie que les photos', () => {
    expect(draft?.agencyName).toBe('OQORO');
    // La visite virtuelle figure dans la galerie : ce n'est pas une image.
    expect(draft?.imageUrls).toEqual([
      'https://cdn.oqoro.com/exemple0000000000000000001',
      'https://cdn.oqoro.com/exemple0000000000000000002',
    ]);
  });

  it('garde la description entière, quartier compris', () => {
    expect(draft?.description).toContain('Saint-Roch');
    expect(draft?.description).toContain('deux balcons de 16 m²');
  });

  it('n’apprend rien d’une page qui ne décrit aucun logement', () => {
    expect(parseDetail('<html><body><h1>Oups</h1></body></html>')).toBeNull();
  });
});

describe('l’annonce normalisée', () => {
  const [carte] = parseListPage(LISTE, LIST_URL).listings;
  const draft = parseDetail(FICHE) ?? {};
  const raw = { ...carte, ...draft, extra: { ...carte?.extra, ...draft.extra } };
  const listing = normalizeListing(raw as Parameters<typeof normalizeListing>[0], {
    sourceId: OQORO_DESCRIPTOR.id,
    nowMs: Date.parse('2026-09-16T12:00:00Z'),
    landlord: OQORO_DESCRIPTOR.landlord,
  });

  it('est une chambre en colocation, meublée, à son loyer charges comprises', () => {
    expect(listing?.propertyType).toBe('room');
    expect(listing?.flatShare).toBe(true);
    expect(listing?.furnished).toBe(true);
    expect(listing?.price).toBe(670);
    expect(listing?.charges).toBe(120);
    expect(listing?.chargesIncluded).toBe(true);
    expect(listing?.deposit).toBe(1100);
    expect(listing?.tenantFees).toBe(306.13);
  });

  it('porte les deux étiquettes énergétiques et les quatre pièces du logement', () => {
    expect(listing?.dpe).toBe('E');
    expect(listing?.ges).toBe('D');
    expect(listing?.rooms).toBe(4);
    expect(listing?.bedrooms).toBe(3);
    expect(listing?.area).toBe(70);
  });

  it('désigne un bailleur professionnel : le gestionnaire facture des honoraires', () => {
    expect(listing?.contact.kind).toBe('agency');
    expect(listing?.contact.agencyName).toBe('OQORO');
    expect(listing?.contact.reference).toBe('OQ0000W');
    // Aucun téléphone ni e-mail n'est publié, et la candidature passe par un
    // chemin que le robots.txt interdit : rien n'est automatisable.
    expect(listing?.contact.phone).toBeNull();
    expect(listing?.contact.formUrl).toBeNull();
  });
});
