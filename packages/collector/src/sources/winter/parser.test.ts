import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDetail, parseListPage } from './parser.js';

const PAGE = 'https://www.agence-winter.com/louer';

// Gabarit réel d'une carte Winter (Rails + Tailwind) : ville, titre, prix, lien
// /biens/a-louer-…-{id}, image en <picture>.
const HTML = `
<div class="anim-fade-up"><div class="thumb">
  <a class="thumb__overlay" href="/biens/a-louer-appartement-nice-114-72-m-4-pieces-2558">Voir l'annonce</a>
  <div class="h-56"><picture>
    <source srcset="/uploads/accommodations/2558/pictures/winter.webp?123 1x" type="image/webp">
    <img class="img-cover" src="/uploads/accommodations/2558/pictures/winter.jpg" />
  </picture></div>
  <div>
    <p class="uppercase tracking-16 mb-2"><small>Nice</small></p>
    <h3>NICE CENTRE - 4 PIECES MEUBLÉ - RUE RAYNARDI</h3>
    <hr />
    <p class="text-lg xl:text-xl">2 350 € / mois</p>
  </div>
</div></div>
<div class="anim-fade-up"><div class="thumb">
  <a href="/biens/a-louer-studio-nice-1690">Voir l'annonce</a>
  <div><p class="uppercase"><small>Nice</small></p><h3>Studio Route de Bellet</h3>
  <p class="text-lg">1 690 € / mois</p></div>
</div></div>`;

describe('parseListPage (Winter)', () => {
  const { listings } = parseListPage(HTML, PAGE, 'Winter Immobilier');

  it('extrait une annonce par carte, avec la référence de l’URL', () => {
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.sourceRef).sort()).toEqual(['1690', '2558']);
  });

  it('lit prix, ville, pièces/surface/meublé et l’URL absolue', () => {
    const l = listings.find((x) => x.sourceRef === '2558');
    expect(l?.priceText).toContain('2 350');
    expect(l?.cityText).toBe('Nice');
    expect(l?.roomsText).toBe('4 PIECES');
    expect(l?.areaText).toBe('114.72 m²'); // depuis le slug « 114-72-m »
    expect(l?.furnishedText).toBe('meublé');
    expect(l?.propertyTypeText).toMatch(/appartement/i);
    expect(l?.sourceUrl).toBe(
      'https://www.agence-winter.com/biens/a-louer-appartement-nice-114-72-m-4-pieces-2558',
    );
    expect(l?.imageUrls?.[0]).toContain('winter.webp');
  });

  it('détecte le studio et n’invente pas la surface absente', () => {
    const l = listings.find((x) => x.sourceRef === '1690');
    expect(l?.roomsText).toBe('studio');
    expect(l?.areaText).toBeUndefined();
  });
});

describe('parseDetail (Winter)', () => {
  const FICHE = readFileSync(
    fileURLToPath(new URL('../../../../../tests/fixtures/winter/detail.html', import.meta.url)),
    'utf8',
  );

  it('lit la description ENTIÈRE dans le bloc « Lire la suite »', () => {
    const description = parseDetail(FICHE)?.description ?? '';
    expect(description).toContain('au 5 rue Châteauneuf');
    expect(description).toContain('Location exclusivement destinée aux étudiants.');
    // Paragraphes et <br> deviennent des retours à la ligne.
    expect(description).toMatch(/Provision EDF : 70 € \/ mois\n+Provision eau froide/);
    expect(description).not.toMatch(/<br|<p/i);
  });

  it('ignore la meta description, qui est le slogan de l’agence', () => {
    expect(parseDetail(FICHE)?.description).not.toContain('Vente, location, gestion');
    expect(
      parseDetail('<html><head><meta name="description" content="Winter" /></head></html>'),
    ).toBeNull();
  });
});
