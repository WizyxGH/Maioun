/**
 * Le passage 123Loger : jusqu'où il descend dans la pagination, et ce qu'il dit
 * quand le catalogue le dépasse. Aucun accès réseau.
 *
 * Le plafond valait treize pages, soit exactement la taille du catalogue au
 * relevé du 2026-09-24 — page treize pleine, page quatorze vide. La première
 * croissance du stock aurait donc été tronquée sans un mot.
 */

import { describe, expect, it } from 'vitest';
import { oneTwoThreeLogerScraper } from './index.js';
import { makeScrapeContext } from '../../../../../tests/helpers/scrape-context.js';

const SEARCH_URL = 'https://www.123loger.com/location/nice-06000/appartement/';

/** Une page de recherche pleine, dont les références dépendent du numéro. */
function pagePleine(numero: number, combien = 20): string {
  const cartes = Array.from({ length: combien }, (_un, rang) => {
    const reference = `p${numero}n${rang}`;
    return `<article><a href="${SEARCH_URL}${reference}/"><h3>Studio ${reference}</h3>
      <span>Nice, (6 000)</span><span>20m2</span><span>1 pièce</span>
      <strong>675 € /mois</strong></a></article>`;
  }).join('');
  // Le lien « page suivante » : ce site l'affiche même sur la dernière page.
  return `${cartes}<a href="${SEARCH_URL}?page=${numero + 1}">suite</a>`;
}

/** Une page vide, sans lien de pagination : la vraie fin du catalogue. */
const PAGE_VIDE = '<p>Aucun résultat</p>';

function contexte(dernierePleine: number) {
  const vues: string[] = [];
  return {
    vues,
    context: makeScrapeContext({
      fetch: (url: string) => {
        vues.push(url);
        const trouve = /[?&]page=(\d+)/.exec(url);
        const numero = trouve === null ? 1 : Number(trouve[1]);
        // Les fiches ne sont pas l'objet de ce test : une page inerte suffit.
        if (!url.startsWith(SEARCH_URL) || /\/p\d+n\d+\//.test(url)) {
          return Promise.resolve({ status: 200, body: '', headers: {}, notModified: false });
        }
        return Promise.resolve({
          status: 200,
          body: numero <= dernierePleine ? pagePleine(numero) : PAGE_VIDE,
          headers: {},
          notModified: false,
        });
      },
    }),
  };
}

describe('passage 123Loger', () => {
  it('descend au-delà de la treizième page quand le catalogue continue', async () => {
    const { context } = contexte(15);
    const result = await oneTwoThreeLogerScraper.run(context);

    // Quinze pages pleines : les 300 annonces doivent toutes remonter.
    expect(result.listings).toHaveLength(300);
  });

  it('s’arrête de lui-même sur la première page vide', async () => {
    const { context, vues } = contexte(3);
    await oneTwoThreeLogerScraper.run(context);

    const pages = vues.filter((url) => url.startsWith(SEARCH_URL) && !/\/p\d/.test(url));
    // Trois pleines, puis la quatrième qui clôt : pas de cinquième requête.
    expect(pages).toHaveLength(4);
  });

  it('prévient quand le plafond est atteint sur une page encore pleine', async () => {
    const { context } = contexte(40);
    const result = await oneTwoThreeLogerScraper.run(context);

    expect(result.warnings.join(' ')).toContain('Plafond de 20 pages atteint');
  });
});
