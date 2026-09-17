/**
 * Repérage d'agences NON scrapées depuis les e-mails des portails (§5, §47).
 *
 * Les e-mails de confirmation de contact des portails ("Votre message a été
 * envoyé à {AGENCE}", "Proposé par {AGENCE}") nomment l'agence — ce que les
 * digests d'alerte ne font pas. On en tire, à chaque collecte, la liste des
 * agences que l'utilisateur a contactées mais qui ne sont pas encore une source
 * du projet : autant de candidates à ajouter (souvent Apimo/Hektor, triviales).
 *
 * Pur et testable : l'appelant fournit les corps d'e-mails et les noms des
 * sources déjà en place.
 */

import { comparable } from '../../normalization/text.js';
import { createAgencyMatcher } from '../agency-names.js';

/**
 * Noms d'agences cités dans les e-mails de confirmation. On capture ce qui suit
 * "envoyé à" ou "Proposé par", en écartant les formules génériques.
 */
export function extractContactedAgencies(bodies: readonly string[]): string[] {
  const seen = new Map<string, string>();
  const pattern =
    /(?:message a été envoyé à|Proposé par)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ0-9'’&.\- ]{2,40}?)(?:\s+Proposé|<|\.|,| Votre| en charge)/g;
  for (const body of bodies) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      const captured = match[1];
      if (captured === undefined) continue;
      const name = captured.replace(/\s+/g, ' ').trim();
      if (name.length < 3 || /une agence|professionnel/i.test(name)) continue;
      const key = comparable(name);
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return [...seen.values()];
}

/**
 * Parmi les agences citées, celles qui ne correspondent à AUCUNE source connue
 * et ne sont pas volontairement ignorées. Le rapprochement des noms est celui
 * de `sources/agency-names.ts`, partagé avec le relevé de couverture : deux
 * façons de comparer des noms d'agences finiraient par ne plus s'accorder.
 * Rend les noms tels qu'affichés, dédoublonnés.
 */
export function findUndiscoveredAgencies(
  bodies: readonly string[],
  knownSourceNames: readonly string[],
): string[] {
  const matcher = createAgencyMatcher(knownSourceNames);
  return extractContactedAgencies(bodies).filter((name) => !matcher.knows(name));
}
