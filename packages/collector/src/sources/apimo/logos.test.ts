import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCES = fileURLToPath(new URL('..', import.meta.url));

/**
 * Sites Apimo qui n'affichent AUCUNE icône à eux — ni `<link rel="icon">`, ni
 * logo d'en-tête —, relevé du 2026-10-05. Le site les montre sous l'icône
 * neutre (`SITES_SANS_FAVICON` côté écran).
 */
const SANS_ICONE_PROPRE = new Set(['cabinet-cordier', 'immo-ideal']);

/**
 * TOUTE SOURCE APIMO DÉCLARE SON LOGO.
 *
 * Sur cette plateforme, `/favicon.ico` sert la même icône Apimo à toutes les
 * agences : 79 d'entre elles s'affichaient sous ce logo commun, Beaumont et
 * Vizcaya comprises. Le repli sur `/favicon.ico`, qui suffit ailleurs, y est
 * donc faux — une source neuve qui oublie `logo` reproduirait l'erreur.
 */
describe('logos des sources Apimo', () => {
  it('chaque source Apimo déclare l’icône de son site', () => {
    const oublis = readdirSync(SOURCES)
      .map((dossier) => ({ dossier, fichier: `${SOURCES}${dossier}/index.ts` }))
      .filter(({ fichier }) => existsSync(fichier))
      .map(({ dossier, fichier }) => ({ dossier, code: readFileSync(fichier, 'utf8') }))
      .filter(({ code }) => /makeApimo(List)?(Scraper|Descriptor)\(/.test(code))
      .filter(({ dossier, code }) => !/^\s*logo: '/m.test(code) && !SANS_ICONE_PROPRE.has(dossier))
      .map(({ dossier }) => dossier);
    expect(oublis).toEqual([]);
    // Deux cents fichiers lus : sous charge, le délai par défaut ne suffit pas.
  }, 30_000);
});
