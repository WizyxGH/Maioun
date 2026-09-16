/**
 * Accès aux pages réelles enregistrées sous `tests/fixtures/`.
 *
 * POURQUOI ICI. Quatre-vingts fichiers de test recalculaient le chemin des
 * fixtures à la main, et pas de la même façon : `import.meta.dirname`,
 * `fileURLToPath(new URL(...))` ou `resolve(dirname(...))`, suivis d'un
 * `'../../../../../'` qui compte les niveaux depuis l'endroit où le test se
 * trouve. Le nombre de points dépendait donc de la PROFONDEUR du test, pas des
 * fixtures : deux fichiers en avaient quatre au lieu de cinq, et déplacer un
 * test d'un dossier le cassait sans que rien ne l'annonce.
 *
 * Le chemin se calcule ici, une fois, depuis ce fichier-ci. Les appelants
 * nomment la fixture, jamais le chemin qui y mène.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Racine des fixtures, voisine de ce dossier de helpers. */
export const FIXTURES_DIR = join(import.meta.dirname, '../fixtures');

/** Chemin d'une fixture, par segments : `fixturePath('orpi', 'nice-page1.html')`. */
export function fixturePath(...parts: readonly string[]): string {
  return join(FIXTURES_DIR, ...parts);
}

/** Contenu d'une fixture, en UTF-8. */
export function readFixture(...parts: readonly string[]): string {
  return readFileSync(fixturePath(...parts), 'utf8');
}

/**
 * Un lecteur attaché à un dossier de source.
 *
 * C'est la forme qu'employaient les tests — `const read = (name) => ...` —,
 * gardée telle quelle pour qu'un test nomme son dossier une seule fois.
 */
export function fixtureReader(...base: readonly string[]): (...parts: readonly string[]) => string {
  return (...parts) => readFixture(...base, ...parts);
}
