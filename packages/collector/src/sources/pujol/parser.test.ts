/**
 * Tests du parseur Pujol, sur deux fiches PRÉLEVÉES le 2026-09-09 — une louée,
 * une en cours — réduites à ce que le parseur lit.
 *
 * Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isClosed, niceListingUrls, parseDetail, referenceOf } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (nom: string): string =>
  readFileSync(resolve(here, `../../../../../tests/fixtures/pujol/${nom}`), 'utf8');

const louee = fixture('louee.html');
const active = fixture('active.html');

const URL_LOUEE =
  'https://www.immobiliere-pujol.fr/annonces/l003048-66-barberis-06300-nice-france/';
const URL_ACTIVE =
  'https://www.immobiliere-pujol.fr/annonces/1089neot-65-boulevard-gambetta-6000-nice/';

describe('niceListingUrls', () => {
  const plan = `<?xml version="1.0"?><urlset>
    <url><loc>https://www.immobiliere-pujol.fr/annonces/l003048-66-barberis-06300-nice-france/</loc></url>
    <url><loc>https://www.immobiliere-pujol.fr/annonces/1089neot-65-boulevard-gambetta-6000-nice/</loc></url>
    <url><loc>https://www.immobiliere-pujol.fr/annonces/1013neot-3-avenue-jules-cantini-13006-marseille-6eme-arrondissement-france/</loc></url>
    <url><loc>https://www.immobiliere-pujol.fr/annonces/</loc></url>
  </urlset>`;

  it('ne retient que les annonces dont l’adresse finit par la commune de Nice', () => {
    expect(niceListingUrls(plan)).toEqual([URL_LOUEE, URL_ACTIVE]);
  });

  it('IGNORE le code postal de l’adresse, qui perd son zéro de tête', () => {
    // « …-gambetta-6000-nice » : quatre chiffres au lieu de cinq. Filtrer sur
    // le code postal aurait écarté cette annonce ; c'est la commune qui décide.
    expect(niceListingUrls(plan)).toContain(URL_ACTIVE);
  });

  it('ne rend rien sur un plan de site vide', () => {
    expect(niceListingUrls('<urlset></urlset>')).toEqual([]);
  });
});

describe('referenceOf', () => {
  it('lit la référence de l’agence en tête du chemin', () => {
    expect(referenceOf(URL_LOUEE)).toBe('l003048');
    expect(referenceOf(URL_ACTIVE)).toBe('1089neot');
  });

  it('rend null sur une adresse qui n’est pas une fiche', () => {
    expect(referenceOf('https://www.immobiliere-pujol.fr/annonces/')).toBeNull();
  });
});

describe('isClosed', () => {
  it('reconnaît le bandeau de clôture', () => {
    expect(isClosed(louee)).toBe(true);
    expect(isClosed(active)).toBe(false);
  });
});

describe('parseDetail', () => {
  it('lit le loyer, la surface et les pièces dans le JSON-LD', () => {
    const parsed = parseDetail(louee, URL_LOUEE);
    expect(parsed?.listing.priceText).toBe('960 €');
    expect(parsed?.listing.areaText).toBe('48.56 m²');
    expect(parsed?.listing.roomsText).toBe('2 pièces');
    expect(parsed?.listing.addressText).toContain('Barberis');
  });

  it('NE CROIT PAS le titre sur la ville', () => {
    // Le gabarit du site écrit « Appartement T2 à louer, 06300, Marseille » sur
    // un bien niçois : l'agence est marseillaise et son modèle l'a figé. Le
    // code postal, lui, est juste.
    expect(louee).toContain('Marseille');
    const parsed = parseDetail(louee, URL_LOUEE);
    expect(parsed?.listing.cityText).toBe('Nice');
    expect(parsed?.listing.postalCodeText).toBe('06300');
  });

  it('signale la clôture pour que le cœur marque l’annonce louée', () => {
    expect(parseDetail(louee, URL_LOUEE)?.closed).toBe(true);
    expect(parseDetail(active, URL_ACTIVE)?.closed).toBe(false);
  });

  it('écarte le logo de l’agence des photos du bien', () => {
    // Il vit sur le même serveur d'images et n'illustre aucun logement.
    const photos = parseDetail(louee, URL_LOUEE)?.listing.imageUrls ?? [];
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.some((u) => /logo/i.test(u))).toBe(false);
  });

  it('refuse une page sans annonce exploitable', () => {
    expect(parseDetail('<html><body>Page introuvable</body></html>', URL_LOUEE)).toBeNull();
  });
});
