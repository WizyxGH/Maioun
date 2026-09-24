/**
 * Faux `ScrapeContext` pour les tests de sources.
 *
 * POURQUOI ICI. Vingt-deux tests de source fabriquaient leur contexte à la
 * main, et six d'entre eux au caractère près. Ce qui variait tenait en deux
 * lignes — ce que `fetch` répond, ce que `isKnown` sait — ; les dix autres
 * (`knownRefs`, `pageRefs`, `detailMemory`, `lastFullPassAt`, `credentials`,
 * `shouldStop`...) étaient du remplissage recopié, qu'aucun de ces tests ne lit.
 *
 * LE COÛT ÉTAIT DANS L'AJOUT D'UN CHAMP : `ScrapeContext` en gagne un, et ce
 * sont vingt-deux fichiers à rouvrir. Un seul contre-exemple le montre déjà —
 * le test des alertes e-mail avait renoncé et forcé le type par un `as unknown`,
 * s'exonérant du même coup de toute vérification.
 *
 * Les défauts sont VOLONTAIREMENT INERTES : rien n'est connu, aucune mémoire ne
 * rend quoi que ce soit, le journal ne dit rien. Un test qui exerce l'un de ces
 * points le surcharge, et cette surcharge se lit alors comme l'objet du test.
 */

import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';

/** Ce qu'un test choisit de faire varier ; tout le reste reste inerte. */
export type ScrapeContextOverrides = Partial<ScrapeContext>;

/** Un contexte inerte, surchargé de ce que le test exerce. */
export function makeScrapeContext(overrides: ScrapeContextOverrides = {}): ScrapeContext {
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: () => Promise.reject(new Error('Aucune requête attendue dans ce test')),
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
    ...overrides,
  };
}

/**
 * Un contexte qui SERT DES PAGES : l'adresse demandée donne son corps, et une
 * adresse absente de la table donne une page vide.
 *
 * C'est le besoin de la plupart des tests de parseur — « voici ce que le site
 * répond, que rend la source ? » —, et c'était exactement le contexte recopié
 * six fois à l'identique.
 */
export function contextServing(
  pages: Readonly<Record<string, string>>,
  overrides: ScrapeContextOverrides = {},
): ScrapeContext {
  return makeScrapeContext({
    fetch: (url) =>
      Promise.resolve({ status: 200, body: pages[url] ?? '', headers: {}, notModified: false }),
    ...overrides,
  });
}
