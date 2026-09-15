/**
 * Figaro Immobilier, sur des annonces PRÉLEVÉES le 2026-09-15 dans l'état
 * Nuxt des pages de résultats, réduites et anonymisées. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { listUrl, parseListPage } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/figaro-immo/${name}`, import.meta.url)),
    'utf8',
  );
const PAGE_1 = fixture('liste-page-1.html');
const LAST_PAGE = fixture('liste-derniere-page.html');

describe('listUrl', () => {
  it('pagine par ?page=N, la seule querystring que le robots.txt laisse ouverte', () => {
    expect(listUrl('appartement', 1)).toBe(
      'https://immobilier.lefigaro.fr/annonces/immobilier-location-appartement-nice+06000.html',
    );
    expect(listUrl('maison', 3)).toBe(
      'https://immobilier.lefigaro.fr/annonces/immobilier-location-maison-nice+06000.html?page=3',
    );
  });
});

describe('parseListPage', () => {
  const { listings, warnings, total, hasNext } = parseListPage(PAGE_1);
  const byRef = (ref: string) => listings.find((listing) => listing.sourceRef === ref);

  it('lit chaque annonce une fois, même servie deux fois', () => {
    expect(listings).toHaveLength(6);
    expect(warnings).toEqual([]);
  });

  it('lit le total annoncé et la page suivante', () => {
    expect(total).toBe(360);
    expect(hasNext).toBe(true);
    const last = parseListPage(LAST_PAGE);
    expect(last.hasNext).toBe(false);
    expect(last.total).toBe(357);
    expect(last.listings).toHaveLength(2);
  });

  it('prend tout ce que la carte d’agence publie', () => {
    expect(byRef('108702721')).toMatchObject({
      sourceUrl: 'https://immobilier.lefigaro.fr/annonces/annonce-108702721.html',
      title: 'Appartement 3 pièces 39.52 m²',
      priceText: '1370 € CC',
      areaText: '39.52 m²',
      roomsText: '3 pièces, 2 chambres',
      propertyTypeText: 'Appartement',
      cityText: 'Nice',
      postalCodeText: '06000',
      agencyName: 'A.G.I.R',
      phoneText: '+33 6 00 00 00 01',
      publishedAtText: '2026-09-11T23:14:09',
      extra: {
        reference: '5_915',
        quartier: 'Cimiez',
        dpe: 'D',
        features: 'Terrasse · Ascenseur · Climatisation · Interphone · Salle d’eau',
        landlord: 'agency',
        updatedAt: '2026-09-12T23:38:45',
      },
    });
    const listing = byRef('108702721');
    expect(listing?.description).toMatch(/^A louer, pour bail étudiant/);
    expect(listing?.imageUrls).toHaveLength(3);
    expect(listing?.imageUrls?.[0]).toMatch(/^https:\/\/lh3\.googleusercontent\.com\//);
  });

  it('ne recopie pas les étiquettes de recherche comme équipements', () => {
    // « colocation », « etudiant », « petit_prix » sont des filtres du site.
    expect(byRef('73641722')?.extra?.['features']).toBe('Climatisation · Salle d’eau');
  });

  it('reconnaît le PARTICULIER relayé, sans prendre le relais pour son agence', () => {
    const particulier = byRef('108796143');
    expect(particulier?.extra?.['landlord']).toBe('private');
    expect(particulier?.extra?.['relais']).toBe('LOCSERVICE');
    expect(particulier?.agencyName).toBeUndefined();
    expect(particulier?.phoneText).toBeUndefined();
    // Le point par défaut des relais LocService ne vaut pas quartier.
    expect(particulier?.extra?.['quartier']).toBeUndefined();
  });

  it('garde le quartier d’une agence et omet un DPE absent', () => {
    const agence = byRef('108793581');
    expect(agence?.extra?.['quartier']).toBe('Rimiez');
    expect(agence?.extra?.['dpe']).toBeUndefined();
    expect(agence?.roomsText).toBe('2 pièces');
  });

  const normalize = (ref: string) => {
    const listing = byRef(ref);
    if (listing === undefined) throw new Error(`annonce ${ref} introuvable`);
    return normalizeListing(listing, {
      sourceId: 'figaro-immo',
      nowMs: Date.parse('2026-09-15T12:00:00Z'),
    });
  };

  it('se normalise en logement exploitable', () => {
    expect(normalize('108702721')).toMatchObject({
      price: 1370,
      chargesIncluded: true,
      area: 39.52,
      rooms: 3,
      bedrooms: 2,
      propertyType: 'apartment',
      furnished: true,
      dpe: 'D',
      district: 'Cimiez',
    });
  });

  it('classe la chambre en chambre', () => {
    expect(byRef('108743787')?.title).toBe('Chambre 1 pièce 12 m²');
    expect(normalize('108743787')?.propertyType).toBe('room');
  });

  it('signale une page sans état au lieu d’inventer une liste vide', () => {
    const broken = parseListPage('<html><body>Maintenance</body></html>');
    expect(broken.listings).toEqual([]);
    expect(broken.total).toBeNull();
    expect(broken.warnings).toHaveLength(1);
  });
});
