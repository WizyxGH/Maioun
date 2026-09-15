import { describe, expect, it } from 'vitest';
import { parseLocationLinks } from './location-links.js';

const PAGE = 'https://www.agenceprivilege.com/fr/locations';

// Sur /fr/locations, les liens de fiches sont `/fr/propriété/{id}` — accent
// littéral, %-encodé (%C3%A9) ou absent. Les autres liens (nav, ventes) sont ignorés.
const HTML = `
<a href="/fr/propri%C3%A9t%C3%A9/87216707">Nice 3 pièces</a>
<a href="/fr/propriété/85675019">Nice studio</a>
<a href="/fr/propri%C3%A9t%C3%A9/87216707">doublon</a>
<a href="/fr/propriete/86895487">sans accent (Immo Idéal)</a>
<a href="/fr/locations">Toutes les locations</a>
<a href="/fr/ventes">Ventes</a>
<a href="/fr/contact">Contact</a>`;

describe('parseLocationLinks (Apimo, ancien schéma)', () => {
  const links = parseLocationLinks(HTML, PAGE);

  it('extrait les fiches location, dédoublonnées, sans les liens de nav', () => {
    expect(links.map((l) => l.reference).sort()).toEqual(['85675019', '86895487', '87216707']);
  });

  it('construit une URL absolue exploitable', () => {
    const l = links.find((x) => x.reference === '85675019');
    expect(l?.canonicalUrl).toBe('https://www.agenceprivilege.com/fr/propri%C3%A9t%C3%A9/85675019');
    expect(l).toMatchObject({ typeSlug: '', citySlug: '' });
  });
});

describe('parseLocationLinks (Apimo, liens récents)', () => {
  const page = 'https://agence.invalid/fr/locations';
  const html = `
    <a href="/fr/propriete/location+appartement+nice+studio-meuble+82754082">Studio</a>
    <a href="https://agence.invalid/fr/propriete/location+garage-parking+nice+box+7359475?x=1">Box</a>
    <a href="/fr/propriete/vente+commerce+nice+pearl+83560212">Vente</a>`;

  it('lit les locations avec leur type et leur commune, sans les ventes', () => {
    expect(parseLocationLinks(html, page)).toEqual([
      {
        reference: '82754082',
        canonicalUrl:
          'https://agence.invalid/fr/propriete/location+appartement+nice+studio-meuble+82754082',
        typeSlug: 'appartement',
        citySlug: 'nice',
      },
      {
        reference: '7359475',
        canonicalUrl:
          'https://agence.invalid/fr/propriete/location+garage-parking+nice+box+7359475',
        typeSlug: 'garage-parking',
        citySlug: 'nice',
      },
    ]);
  });
});
