/**
 * Une agence est-elle SUIVIE, c'est-à-dire lue sur son propre site ?
 *
 * Les portails (Bien'ici, FNAIM, ParuVendu, alertes…) montrent des agences
 * que Maïoun ne lit nulle part ailleurs : leurs biens n'arrivent qu'avec le
 * retard et les manques du portail. Les repérer à chaque collecte, c'est la
 * liste des sources à ajouter — tenue à jour par les annonces elles-mêmes.
 *
 * Une source porte un `domain` quand c'est le site d'une agence ; les portails
 * n'en ont pas (voir `sources.generated.ts`).
 */

import { SOURCES, type SourceInfo } from './sources.generated.js';

export function isFollowedAgency(
  sources: readonly string[],
  table: Readonly<Record<string, SourceInfo>> = SOURCES,
): boolean {
  return sources.some((id) => {
    const info = table[id];
    return info !== undefined && info.domain !== null;
  });
}
