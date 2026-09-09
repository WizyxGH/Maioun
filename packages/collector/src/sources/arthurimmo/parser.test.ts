/**
 * Tests du parseur Arthurimmo, sur des extraits PRÉLEVÉS le 2026-09-09 et
 * réduits à ce que le parseur lit : les ancres canoniques d'un côté, l'en-tête
 * d'une fiche de l'autre.
 *
 * Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDetail, parseListPage, parseSocialTitle } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (nom: string): string =>
  readFileSync(resolve(here, `../../../../../tests/fixtures/arthurimmo/${nom}`), 'utf8');

const liste = fixture('liste.html');
const fiche = fixture('fiche.html');

describe('parseListPage', () => {
  it('relève les fiches de location et lit ville et code postal dans l’adresse', () => {
    const liens = parseListPage(liste);
    expect(liens.length).toBeGreaterThan(0);
    for (const lien of liens) {
      expect(lien.url).toContain('/annonces/location/');
      expect(lien.reference).toMatch(/^\d{4,}$/);
      expect(lien.postalCode).toMatch(/^\d{5}$/);
      expect(lien.city).not.toBe('');
    }
  });

  it('ne compte pas deux fois une fiche liée plusieurs fois', () => {
    // La carte porte plusieurs ancres vers la même fiche — image, titre,
    // surface cliquable.
    const doublee = `${liste}${liste}`;
    expect(parseListPage(doublee).length).toBe(parseListPage(liste).length);
  });

  it('IGNORE les ventes, même listées par la même page', () => {
    const avecVente =
      liste +
      '<a href="https://groupenicetransactions.arthurimmo.com/annonces/vente/appartement/nice-06000/99999999.htm"></a>';
    expect(parseListPage(avecVente).some((l) => l.reference === '99999999')).toBe(false);
  });

  it('ne rend rien sur une page vide, sans lever', () => {
    expect(parseListPage('<html><body>Aucun résultat</body></html>')).toEqual([]);
  });
});

describe('parseSocialTitle', () => {
  it('lit les quatre faits dans l’ordre invariable du site', () => {
    expect(parseSocialTitle('Louer appartement de 5 pièces 128 m² 2 950 € à Nice (06000)')).toEqual(
      {
        propertyType: 'appartement',
        rooms: '5 pièces',
        area: '128 m²',
        price: '2950 €',
      },
    );
  });

  it('ne prend pas un montant qui n’est pas le loyer', () => {
    // Honoraires et dépôt de garantie vivent ailleurs dans la page : seul le
    // montant qui PRÉCÈDE « à <ville> » est le loyer.
    const lu = parseSocialTitle('Louer studio de 1 pièce 22 m² 640 € à Nice (06300)');
    expect(lu.price).toBe('640 €');
  });

  it('rend ce qu’il trouve quand le titre est incomplet', () => {
    const lu = parseSocialTitle('Louer maison à Nice (06200)');
    expect(lu.price).toBeUndefined();
    expect(lu.area).toBeUndefined();
  });
});

describe('parseDetail', () => {
  const lien = {
    url: 'https://groupenicetransactions.arthurimmo.com/annonces/location/appartement/nice-06000/33699516.htm',
    reference: '33699516',
    city: 'nice',
    postalCode: '06000',
  };

  it('compose une annonce complète à partir de l’en-tête', () => {
    const annonce = parseDetail(fiche, lien);
    expect(annonce).not.toBeNull();
    expect(annonce?.sourceRef).toBe('33699516');
    expect(annonce?.priceText).toBe('2950 €');
    expect(annonce?.areaText).toBe('128 m²');
    expect(annonce?.roomsText).toBe('5 pièces');
    expect(annonce?.postalCodeText).toBe('06000');
  });

  it('rend les entités du titre et de la description', () => {
    // Le site écrit `&#039;` pour une apostrophe, et sépare ses lignes par des
    // retours chariot seuls.
    const annonce = parseDetail(fiche, lien);
    expect(annonce?.description).not.toContain('&#039;');
    expect(annonce?.description).not.toContain('\r');
  });

  it('retire la signature commerciale du titre', () => {
    // « : une annonce Arthurimmo.com » est ajouté par le site à chaque fiche ;
    // le garder polluerait la recherche plein texte et le rapprochement des
    // titres au dédoublonnage.
    expect(parseDetail(fiche, lien)?.title).not.toMatch(/une annonce Arthurimmo/i);
  });

  it('reprend les photos et le DPE', () => {
    const annonce = parseDetail(fiche, lien);
    expect(annonce?.imageUrls?.length).toBeGreaterThan(0);
    expect(annonce?.imageUrls?.every((u) => u.startsWith('https://'))).toBe(true);
    expect(annonce?.extra?.['dpe']).toMatch(/^[A-G]$/);
  });

  it('REFUSE une page qui n’est pas une annonce', () => {
    // Bien retiré, page d'erreur : sans loyer ni surface, il n'y a rien à
    // publier, et inventer serait pire que d'omettre.
    const vide = '<html><head><meta property="og:title" content="Arthurimmo.com" /></head></html>';
    expect(parseDetail(vide, lien)).toBeNull();
  });
});
