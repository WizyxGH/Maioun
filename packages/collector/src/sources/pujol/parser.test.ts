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
import { normalizeListing } from '../../normalization/normalize.js';
import { descriptionOf, isClosed, niceListingUrls, parseDetail, referenceOf } from './parser.js';

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

  it('lit la description ENTIÈRE dans la page, et non le JSON-LD coupé à 500 caractères', () => {
    const texte = parseDetail(louee, URL_LOUEE)?.listing.description ?? '';
    expect(texte.length).toBeGreaterThan(1_000);
    expect(texte).toContain('La gestionnaire de cet appartement est Camille.');
    // Les <BR> du site deviennent des retours à la ligne, jamais du texte.
    expect(texte).not.toMatch(/<br/i);
    expect(texte).toContain('66 rue Barberis 06300 Nice.\nCet appartement se compose');
    expect(parseDetail(active, URL_ACTIVE)?.listing.description).toContain(
      'nous ne manquerons pas de revenir vers vous.',
    );
  });

  it('se rabat sur le JSON-LD, <BR> convertis, si le bloc de la page manque', () => {
    expect(descriptionOf('<html></html>', 'Deux pièces.<BR>Balcon.')).toBe('Deux pièces.\nBalcon.');
    expect(descriptionOf('<html></html>', undefined)).toBeUndefined();
  });

  it('refuse une page sans annonce exploitable', () => {
    expect(parseDetail('<html><body>Page introuvable</body></html>', URL_LOUEE)).toBeNull();
  });
});

describe('parseDetail — caractéristiques, montants et DPE', () => {
  const url = 'https://www.immobiliere-pujol.fr/annonces/1399neot-7-9-rue-de-dijon-6100-nice/';
  const listing = parseDetail(fixture('active-details.html'), url)?.listing;

  it('lit charges, dépôt, honoraires et ameublement dans les listes', () => {
    expect(listing?.chargesText).toBe('70 €/mois');
    expect(listing?.depositText).toBe('1025 €');
    expect(listing?.feesText).toBe('642,49 €');
    expect(listing?.furnishedText).toBe('Non meublé');
  });

  it('lit la classe DPE de l’étiquette et le quartier de la ligne d’adresse', () => {
    // Pas de `reference` : « 1399neot » vient de l'URL, l'agence ne l'affiche pas.
    expect(listing?.extra).toEqual({ dpe: 'E', quartier: 'Vernier' });
  });

  it('va jusqu’à la fiche normalisée', () => {
    const normalized =
      listing === undefined
        ? null
        : normalizeListing(listing, {
            sourceId: 'pujol',
            nowMs: Date.parse('2026-09-15T12:00:00Z'),
          });
    expect(normalized?.charges).toBe(70);
    expect(normalized?.deposit).toBe(1025);
    expect(normalized?.tenantFees).toBe(642.49);
    expect(normalized?.dpe).toBe('E');
    expect(normalized?.furnished).toBe(false);
    expect(normalized?.district).toBe('Vernier');
  });
});
