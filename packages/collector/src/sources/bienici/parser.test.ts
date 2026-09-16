/**
 * Tests du parseur Bien'ici, sur une fixture PRÉLEVÉE le 2026-09-08 et choisie
 * pour couvrir les cinq cas qui décident du mappage : position exacte, position
 * floutée à 50 m, position réduite à la commune, maison, et bien non meublé.
 *
 * Aucun accès réseau (§59).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildDetailUrl,
  buildSearchUrl,
  isWithdrawnDraft,
  NICE_ZONE_ID,
  parseAdDetail,
  parseSearchResponse,
} from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../../../../../tests/fixtures/bienici/search.json');
const body = readFileSync(FIXTURE, 'utf8');
/** Relevé du 2026-09-14 : une annonce Twimmo, une Century 21, une Citya. */
const body0914 = readFileSync(
  resolve(here, '../../../../../tests/fixtures/bienici/search-2026-09-14.json'),
  'utf8',
);
/** Fiche JSON de la même annonce Twimmo ; le numéro y est remplacé par un fictif. */
const detail = readFileSync(
  resolve(here, '../../../../../tests/fixtures/bienici/detail-twimmo-2125653.json'),
  'utf8',
);
/** Fiche d'une annonce que le portail a retirée ; agence et numéro fictifs. */
const detailRetiree = readFileSync(
  resolve(here, '../../../../../tests/fixtures/bienici/detail-retiree.json'),
  'utf8',
);

describe('buildSearchUrl', () => {
  it('vise le chemin déclaré dans allowedPaths', () => {
    expect(buildSearchUrl(NICE_ZONE_ID, 1)).toContain(
      'https://www.bienici.com/realEstateAds.json?filters=',
    );
  });

  it("n'emploie aucun paramètre interdit par le robots.txt (§10)", () => {
    const url = buildSearchUrl(NICE_ZONE_ID, 2);
    expect(url).not.toMatch(/[?&]mode=/);
    expect(url).not.toMatch(/tri=/);
    expect(url).not.toContain('/recherche/');
    expect(url).not.toContain('/annonces-');
  });

  it('décale `from` en fonction de la page', () => {
    const decoded = decodeURIComponent(buildSearchUrl(NICE_ZONE_ID, 3, 100));
    expect(decoded).toContain('"from":200');
    expect(decoded).toContain('"zoneIds":["-170100"]');
    expect(decoded).toContain('"filterType":"rent"');
  });
});

describe('parseSearchResponse', () => {
  it('lit toutes les annonces de la fixture et remonte le total', () => {
    const parsed = parseSearchResponse(body);
    expect(parsed.listings).toHaveLength(5);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.total).toBeGreaterThan(100);
  });

  it('donne à chaque annonce une référence et une URL de fiche consultable', () => {
    for (const listing of parseSearchResponse(body).listings) {
      expect(listing.sourceRef).not.toBe('');
      expect(listing.sourceUrl).toBe(`https://www.bienici.com/annonce/${listing.sourceRef}`);
    }
  });

  it('annonce le loyer CHARGES COMPRISES, et les charges à part', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'netty-company56146lrb-appt-6822',
    );
    // Relevé : price 680, charges 40 — le champ `charges` est la part INCLUSE.
    expect(listing?.priceText).toBe('680 € CC');
    expect(listing?.chargesText).toBe('40 €');
  });

  it('reprend dépôt de garantie et honoraires, état des lieux compris', () => {
    const listings = parseSearchResponse(body).listings;
    const listing = listings.find((one) => one.sourceRef === 'apimo-87323377');
    // Relevé : agencyRentalFee 305,24 dont inventoryOfFixturesFees 70,44.
    expect(listing).toMatchObject({ depositText: '740 €', feesText: '305.24 €' });
    const sansHonoraires = listings.find((one) => one.sourceRef === 'apimo-87323089');
    expect(sansHonoraires?.depositText).toBe('950 €');
    expect(sansHonoraires?.feesText).toBeUndefined();
  });

  it('publie la position quand la source la déclare exacte', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'apimo-87323377',
    );
    expect(listing?.latitude).toBeTypeOf('number');
    expect(listing?.longitude).toBeTypeOf('number');
  });

  it('publie la position quand le flou reste sous 100 m', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'netty-company56146lrb-appt-6822',
    );
    expect(listing?.latitude).toBeCloseTo(43.7, 1);
  });

  it('TAIT la position quand le site ne situe que la commune (§17)', () => {
    // `cityOrArrondissement` et les disques de 1 000 m : à ce rayon, le temps
    // de trajet serait faux et le rapprochement « même endroit » du hasard.
    const parsed = parseSearchResponse(body);
    const cityOnly = parsed.listings.find((one) => one.sourceRef === 'apimo-87323089');
    const wideDisk = parsed.listings.find((one) => one.sourceRef === 'apimo-87305863');
    expect(cityOnly?.latitude).toBeUndefined();
    expect(cityOnly?.longitude).toBeUndefined();
    expect(wideDisk?.latitude).toBeUndefined();
  });

  it('retient la photo à son adresse d’origine, jamais la copie du portail', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'netty-company56146lrb-appt-6822',
    );
    expect(listing?.imageUrls?.[0]).toContain('img.netty.immo');
    expect(listing?.imageUrls?.every((url) => !url.includes('file.bienici.com'))).toBe(true);
    expect(listing?.imageUrls?.every((url) => url.startsWith('https://'))).toBe(true);
  });

  it('débarrasse la description de son balisage', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'netty-company56146lrb-appt-6822',
    );
    expect(listing?.description).not.toContain('<br>');
    expect(listing?.description).not.toMatch(/<[^>]+>/);
    expect(listing?.description).toContain('\n');
  });

  it('reprend le quartier nommé et le DPE dans `extra`', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'netty-company56146lrb-appt-6822',
    );
    // Le quartier seul, comme l'écrivent les autres sources : « Nice - Carabacel »
    // est le libellé du portail, pas un nom de quartier.
    expect(listing?.extra?.['quartier']).toBe('Carabacel');
    expect(listing?.extra?.['dpe']).toMatch(/^[A-G]$/);
  });

  it('ne prend pas la commune pour un quartier (§17)', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'apimo-87323089',
    );
    // `district` y vaut le polygone de la ville entière : « Nice » n'apprend rien.
    expect(listing?.extra?.['quartier']).toBeUndefined();
  });

  it('prend le code postal du QUARTIER, plus précis que celui de l’annonce', () => {
    const parsed = parseSearchResponse(body).listings;
    // Rimiez est en 06100, là où l'annonce annonce le 06000 de la commune.
    expect(parsed.find((one) => one.sourceRef === 'apimo-87305863')?.postalCodeText).toBe('06100');
    // Faute de quartier, celui de l'annonce reste le meilleur qu'on ait.
    expect(parsed.find((one) => one.sourceRef === 'apimo-87323089')?.postalCodeText).toBe('06300');
  });

  it('déclare le bailleur, et nomme l’agence quand c’en est une', () => {
    const listing = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'netty-company56146lrb-appt-6822',
    );
    expect(listing?.extra?.['landlord']).toBe('agency');
    expect(listing?.agencyName).toBe('CONFIANCE IMMOBILIERE');
  });

  it('ne dit « meublé » que lorsque la source l’affirme (§17)', () => {
    const parsed = parseSearchResponse(body);
    const furnished = parsed.listings.find(
      (one) => one.sourceRef === 'netty-company56146lrb-appt-6822',
    );
    const notFurnished = parsed.listings.find(
      (one) => one.sourceRef === 'hektor-cabinet_agir-2767',
    );
    expect(furnished?.furnishedText).toBe('meublé');
    // Ni « meublé » ni « non meublé » : le champ est absent, et le normaliseur
    // ira chercher dans le texte plutôt que de se voir imposer une négation.
    expect(notFurnished?.furnishedText).toBeUndefined();
  });

  it('nomme le type de bien en français', () => {
    const house = parseSearchResponse(body).listings.find(
      (one) => one.sourceRef === 'apimo-87305863',
    );
    expect(house?.propertyTypeText).toMatch(/^Maison/);
  });

  it('ignore une annonce sans identifiant, et le signale', () => {
    const parsed = parseSearchResponse(
      JSON.stringify({ total: 2, realEstateAds: [{ title: 'sans id' }, { id: 'x', title: 'ok' }] }),
    );
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('sans identifiant');
  });

  it('rend une réponse vide et un avertissement sur un corps illisible', () => {
    expect(parseSearchResponse('<html>').listings).toEqual([]);
    expect(parseSearchResponse('<html>').warnings[0]).toContain('illisible');
    expect(parseSearchResponse('{"total":0}').warnings[0]).toContain('sans tableau');
  });
});

describe('relevé du 2026-09-14', () => {
  const listings = parseSearchResponse(body0914).listings;
  const byRef = (ref: string) => listings.find((one) => one.sourceRef === ref);

  it('retombe sur la copie HTTPS du portail quand l’original est en http', () => {
    // Twimmo et Citya publient leurs clichés en `http://` : sans repli, aucune photo.
    for (const ref of ['twimmo-2125653', 'citya-immobilier-1127-GES84100033-53']) {
      const urls = byRef(ref)?.imageUrls ?? [];
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((url) => url.startsWith('https://file.bienici.com/'))).toBe(true);
    }
  });

  it('garde l’original quand il est déjà en HTTPS', () => {
    const urls = byRef('century-21-202_579_16656')?.imageUrls ?? [];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((url) => url.includes('file.bienici.com'))).toBe(false);
  });

  it('traduit balcon, terrasse, parking, jardin et climatisation déclarés', () => {
    const c21 = byRef('century-21-202_579_16656')?.extra?.['features'] ?? '';
    for (const atout of ['Balcon', 'Terrasse', 'Parking', 'Climatisation']) {
      expect(c21).toContain(atout);
    }
    expect(byRef('citya-immobilier-1127-GES84100033-53')?.extra?.['features']).toContain('Jardin');
    // Twimmo : « hasTerrace: false », pas de balcon déclaré.
    expect(byRef('twimmo-2125653')?.extra?.['features']).toBe('6e étage, Ascenseur');
  });

  it('ne nomme pas d’agence que la liste tait', () => {
    // `accountDisplayName` absent : la fiche JSON le donnera.
    expect(byRef('twimmo-2125653')?.agencyName).toBeUndefined();
    expect(byRef('twimmo-2125653')?.extra?.['landlord']).toBe('agency');
  });
});

describe('parseAdDetail', () => {
  it('vise la fiche JSON de l’annonce', () => {
    expect(buildDetailUrl('twimmo-2125653')).toBe(
      'https://www.bienici.com/realEstateAd.json?id=twimmo-2125653',
    );
  });

  it('reprend l’agence et son téléphone d’un contact professionnel', () => {
    expect(parseAdDetail(detail)).toEqual({
      agencyName: 'ELITIMO',
      phoneText: '+33600000012',
    });
  });

  it('ne collecte rien d’un contact que le site ne déclare pas professionnel', () => {
    const prive = JSON.parse(detail) as { contactRelativeData: Record<string, unknown> };
    prive.contactRelativeData['contactIsPro'] = false;
    expect(parseAdDetail(JSON.stringify(prive))).toBeNull();
    expect(parseAdDetail('{}')).toBeNull();
    expect(parseAdDetail('<html>')).toBeNull();
  });

  it('marque retirée l’annonce que le portail dit hors marché', () => {
    const draft = parseAdDetail(detailRetiree);
    expect(isWithdrawnDraft(draft ?? undefined)).toBe(true);
    // Le retrait prime : on ne rapporte pas l'agence d'une annonce qui n'existe plus.
    expect(draft?.phoneText).toBeUndefined();
  });

  it('ne retire QUE sur un « hors marché » explicite', () => {
    // Une fiche en ligne, une fiche muette : ni l'une ni l'autre n'est retirée.
    expect(isWithdrawnDraft(parseAdDetail(detail) ?? undefined)).toBe(false);
    expect(isWithdrawnDraft(parseAdDetail('{"status":{}}') ?? undefined)).toBe(false);
    expect(isWithdrawnDraft(parseAdDetail('{}') ?? undefined)).toBe(false);
  });
});
