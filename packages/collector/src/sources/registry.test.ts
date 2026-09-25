import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_SCRAPERS } from './index.js';

// Une centaine de sources déclarées par configuration : un copier-coller raté
// donnerait deux sources au même identifiant, et l'une écraserait l'autre.
describe('ALL_SCRAPERS', () => {
  const descriptors = ALL_SCRAPERS.map((scraper) => scraper.descriptor);

  it('ne déclare jamais deux fois le même identifiant', () => {
    const ids = descriptors.map((d) => d.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('ne collecte jamais deux fois le même site d’agence', () => {
    const domains = descriptors
      .filter((d) => d.kind === 'localAgency' && d.domain !== undefined)
      .map((d) => d.domain);
    expect(domains.filter((domain, i) => domains.indexOf(domain) !== i)).toEqual([]);
  });

  /**
   * UNE LISTE FILTRÉE CACHE CE QU'ELLE ÉCARTE, ET SANS TRACE.
   *
   * `immo-sud` visait `/location/1-nice/appartement/1` : la page rendait
   * 3 fiches là où `/location/1` en rend 6 (mesuré le 2026-09-25 avec le
   * parseur du projet). Trois annonces invisibles, et rien pour le signaler —
   * une source filtrée a l'air de marcher, elle rend simplement moins.
   *
   * Ce n'est pas au scraper de choisir le périmètre : il lit ce que l'agence
   * publie, et ce sont les CRITÈRES qui écartent ensuite ce qui est hors zone
   * ou hors type. Filtrer à la collecte, c'est perdre sans trace.
   *
   * ON LIT LES FICHIERS, PAS LES DESCRIPTEURS. `listUrls` est une configuration
   * de fabrique : elle ne remonte pas dans `SourceDescriptor`, et une première
   * version de ce test parcourait donc un tableau toujours vide — elle passait
   * sur la valeur fautive comme sur la bonne. Un garde-fou qui ne peut pas
   * échouer ne garde rien.
   */
  it('ne filtre jamais sa liste par type de bien', () => {
    const TYPES = new Set([
      'appartement',
      'appartements',
      'maison',
      'maisons',
      'studio',
      'studios',
      'villa',
      'villas',
      'loft',
      'lofts',
      'duplex',
    ]);
    const racine = dirname(fileURLToPath(import.meta.url));
    const urls = readdirSync(racine, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const fichier = join(racine, entry.name, 'index.ts');
        if (!existsSync(fichier)) return [];
        const source = readFileSync(fichier, 'utf8');
        return [...source.matchAll(/'(https?:\/\/[^']+)'/g)].map((match) => ({
          source: entry.name,
          url: match[1] ?? '',
        }));
      });

    /**
     * DEUX EXCEPTIONS, ET CHACUNE EST CHIFFRÉE — pas un tapis sous lequel
     * glisser le problème. Relevé du 2026-09-25.
     *
     * FONCIA PERD VRAIMENT. `/location/nice-06000/appartement` annonce
     * 15 annonces ; `/location/nice-06000` en annonce 78. Soixante-trois nous
     * échappent, tous types confondus.
     *
     * Mais ce n'est pas qu'une URL à élargir : deux endroits du scraper
     * RECONSTRUISENT l'adresse d'une fiche à partir de sa seule référence, en y
     * remettant `appartement` en dur (contrôle de retrait, état de la
     * candidature). Élargir la liste sans les corriger d'abord ferait répondre
     * 404 à toute maison, et le contrôle de retrait la marquerait LOUÉE. Mieux
     * vaut une source trop étroite qu'une source qui efface des annonces
     * vivantes.
     *
     * L'ADRESSE NE PERD RIEN, et son filtre n'est pas un choix : son site EXIGE
     * le type dans le chemin. `/recherche/location/nice-06000` rend une page
     * sans la moindre fiche, quand `/recherche/location/appartement/nice-06000`
     * en rend 30 — et ni `/maison/` ni `/studio/` n'ont d'annonce niçoise.
     */
    const AVEC_RAISON = new Set(['foncia', 'ladresse']);

    // La preuve que le test a de quoi mordre : sans URL lue, il ne dirait rien.
    expect(urls.length).toBeGreaterThan(100);

    for (const { source, url } of urls) {
      if (AVEC_RAISON.has(source)) continue;
      // Les SEGMENTS, et non la chaîne : « maisonquatre.la-boite-immo.com » et
      // « french-riviera-studios » portent le mot dans leur nom, ce qui ne
      // filtre rien.
      const segments = new URL(url).pathname.split('/').filter((part) => part !== '');
      const filtre = segments.find((part) => TYPES.has(part.toLowerCase()));
      expect(filtre, `${source} : ${url}`).toBeUndefined();
    }
  });

  it('pointe le logo d’une agence sur son propre site', () => {
    for (const d of descriptors) {
      if (d.logo === undefined || d.domain === undefined) continue;
      expect(new URL(d.logo).hostname.replace(/^www\./, ''), d.id).toBe(d.domain);
    }
  });
});
