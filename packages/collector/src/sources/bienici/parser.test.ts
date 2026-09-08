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
import { buildSearchUrl, NICE_ZONE_ID, parseSearchResponse } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, '../../../../../tests/fixtures/bienici/search.json');
const body = readFileSync(FIXTURE, 'utf8');

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
    expect(listing?.extra?.['quartier']).toBe('Nice - Carabacel');
    expect(listing?.extra?.['dpe']).toMatch(/^[A-G]$/);
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
