import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseListPage, parseWithdrawn } from './parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/ladresse');
const LIST_URL = 'https://www.ladresse.com/recherche/location/appartement/nice-06000';
const liste = readFileSync(join(FIXTURES, 'liste.html'), 'utf8');

describe('parseListPage — L’Adresse', () => {
  const { listings, warnings } = parseListPage(liste, LIST_URL, "L'Adresse");

  it('extrait toutes les cartes, dédoublonnées sur la référence', () => {
    expect(warnings).toHaveLength(0);
    expect(listings.length).toBeGreaterThanOrEqual(10);
    expect(new Set(listings.map((l) => l.sourceRef)).size).toBe(listings.length);
  });

  it('lit prix CC, surface, pièces, ville/CP, lien et photo', () => {
    const l = listings.find((x) => x.sourceRef === '14564121');
    expect(l?.sourceUrl).toBe(
      'https://www.ladresse.com/annonce/location/appartement/nice-06000/14564121',
    );
    expect(l?.priceText).toContain('1 207');
    expect(l?.priceText?.toLowerCase()).toContain('mois');
    expect(l?.areaText).toBe('76.25 m²');
    expect(l?.roomsText).toBe('3 pièces');
    expect(l?.cityText?.toUpperCase()).toContain('NICE');
    expect(l?.postalCodeText).toBe('06000');
    expect((l?.imageUrls ?? []).length).toBeGreaterThan(0);
  });

  it('se normalise : loyer CC, surface, ville Nice', () => {
    const l = listings.find((x) => x.sourceRef === '14564121');
    const normalized = normalizeListing(l as NonNullable<typeof l>, {
      sourceId: 'ladresse',
      nowMs: Date.parse('2026-08-22T12:00:00Z'),
    });
    expect(normalized).not.toBeNull();
    if (normalized === null) return;
    expect(normalized.price).toBe(1207);
    expect(normalized.chargesIncluded).toBe(true);
    expect(normalized.area).toBe(76.25);
    expect(normalized.rooms).toBe(3);
    expect(normalized.city).toBe('nice');
  });

  it('donne à CHAQUE carte sa propre surface (§17)', () => {
    // Le sélecteur portait sur le document entier : `htmlToText` prenait la
    // PREMIÈRE description de la page, et les treize annonces héritaient de sa
    // surface et de son nombre de pièces — « 76,25 m² », « 3 pièces », partout.
    // Le test d'origine ne regardait qu'une annonce, justement celle dont ces
    // valeurs étaient les bonnes : le défaut était invisible.
    const surfaces = new Set(listings.map((l) => l.areaText));
    expect(surfaces.size).toBeGreaterThan(3);
    const pieces = new Set(listings.map((l) => l.roomsText));
    expect(pieces.size).toBeGreaterThan(1);
  });

  it('conserve les communes voisines (écartées ensuite au scoring)', () => {
    const cannet = listings.find((l) => l.postalCodeText === '06110');
    expect(cannet).toBeDefined();
  });
});

describe('parseDetail — L’Adresse', () => {
  const fiche = readFileSync(join(FIXTURES, 'fiche.html'), 'utf8');

  it('lit la description ENTIÈRE, que la carte ne fait que résumer', () => {
    // La carte ne donnait que « 3 pièces , 2 chambres 76.25 m² Avec balcon ».
    const description = parseDetail(fiche)?.description ?? '';
    expect(description).toMatch(/^Avenue Jean Barès/);
    expect(description).toContain('Une cave et un box fermé vient compléter le bien.');
    expect(description).toContain('Proche de toutes commodités.');
    // Les retours à la ligne de l'agence sont gardés.
    expect(description).toContain('\nDisponible début septembre.');
  });

  it('ne prend ni la mention Géorisques commune ni les biens similaires', () => {
    const description = parseDetail(fiche)?.description ?? '';
    expect(description).not.toContain('Les informations sur les risques');
    expect(description).not.toContain('21.54 m²');
  });

  it('ne rend rien sans bloc de description', () => {
    expect(
      parseDetail('<html><body><div class="bien-description">1 pièce</div></body></html>'),
    ).toBeNull();
  });
});

describe('parseWithdrawn (L’Adresse)', () => {
  it('reconnaît le bandeau posé sur une annonce retirée', () => {
    // Relevé le 2026-09-04 sur deux fiches restées en ligne après retrait.
    expect(
      parseWithdrawn(
        `<div class="annonce-reference"><span class="bien-exclusif">CE BIEN N'EST PLUS
         DISPONIBLE A LA LOCATION</span><br><span>Réf. 14348630</span></div>`,
      ),
    ).toBe(true);
  });

  it('ne voit rien sur une fiche encore active', () => {
    expect(parseWithdrawn('<div>Bel appartement disponible à la location</div>')).toBe(false);
    expect(parseWithdrawn('<html></html>')).toBe(false);
  });
});

describe('parseDetail — montants, DPE et téléphone (L’Adresse)', () => {
  const fiche = readFileSync(join(FIXTURES, 'fiche.html'), 'utf8');

  it('lit la ligne de résumé, la classe DPE et le numéro de l’agence', () => {
    const draft = parseDetail(fiche);
    expect(draft?.depositText).toBe('1700 €');
    expect(draft?.chargesText).toBe('50 €');
    expect(draft?.feesText).toBe('598.00 €');
    expect(draft?.extra).toEqual({ dpe: 'C', ges: 'A' });
    expect(draft?.phoneText).toBe('0600000061');
  });

  it('va jusqu’à la fiche normalisée', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '13368391',
        sourceUrl: 'https://www.ladresse.com/annonce/location/appartement/nice-06000/13368391',
        priceText: '900 € / mois cc',
        ...parseDetail(fiche),
      },
      { sourceId: 'ladresse', nowMs: Date.parse('2026-09-15T12:00:00Z') },
    );
    expect(normalized?.deposit).toBe(1700);
    expect(normalized?.charges).toBe(50);
    expect(normalized?.tenantFees).toBe(598);
    expect(normalized?.dpe).toBe('C');
    expect(normalized?.contact.phone).not.toBeNull();
  });
});

describe('parseListPage — le secours « .bien-geo » ne nomme pas toujours', () => {
  /**
   * Mesuré en base : une annonce portait « a 17 km de nice » comme commune. Le
   * repli lit le bandeau de la carte, qui situe la commune au lieu de la nommer
   * quand elle est lointaine.
   */
  const CARTE = (geo: string): string => `
<html><body>
  <a class="bien" href="/annonce/location/appartement/nice-06000/10529650" data-id="10529650">
    <img alt="Appartement (06670) 1 pièce 18.00 m²" src="https://exemple.invalid/p.jpg">
    <span class="bien-geo">${geo}</span>
    <span class="bien-prix">590 € / mois</span>
  </a>
</body></html>`;

  it('ne garde pas une distance en guise de commune', () => {
    const { listings } = parseListPage(CARTE('à 17 km de Nice'), LIST_URL, "L'Adresse");
    expect(listings[0]?.cityText).toBeUndefined();
    // Le code postal de l'alt reste : il situe, lui.
    expect(listings[0]?.postalCodeText).toBe('06670');
  });

  it('garde le secours quand il nomme vraiment une commune', () => {
    const { listings } = parseListPage(CARTE('Colomars (3)'), LIST_URL, "L'Adresse");
    expect(listings[0]?.cityText).toBe('Colomars');
  });
});
