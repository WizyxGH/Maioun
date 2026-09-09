/**
 * Résolution des points de référence privés : d'où l'on part pour calculer un
 * temps de trajet.
 *
 * ILS SE RÈGLENT DEPUIS L'ÉCRAN PARAMÈTRES, et de nulle part ailleurs. On y
 * saisit une adresse — « 12 rue X, Nice » — géocodée une fois puis mise en
 * cache, sans avoir à chercher ses coordonnées.
 *
 * Ils ont eu un second domicile dans des variables d'environnement, avec leurs
 * propres coordonnées. Une adresse saisie sur le téléphone pouvait alors
 * paraître sans effet, silencieusement doublée par un fichier posé sur la
 * machine qui collecte — et ces coordonnées-là révèlent un domicile et un lieu
 * de travail, ce qui rend le doublon d'autant moins souhaitable.
 *
 * POURQUOI UN MODULE À PART. Cette résolution vivait dans la commande de
 * collecte. Une seconde commande s'est contentée des seules coordonnées
 * explicites — et comme l'utilisateur ne déclarait qu'une ADRESSE, elle a
 * rescoré tout l'inventaire avec ZÉRO point de référence : distances et
 * coordonnées géocodées effacées des fiches. Un calcul dont l'oubli EFFACE des
 * données n'a pas sa place dans un appelant.
 */

import { parseReferencePoints, type StoredReferencePoint } from '@maioun/shared';
import type { Logger } from './logger.js';
import type { ReferencePoint } from '../config.js';
import { collectorUserAgent } from '../config.js';
import { createGeocoder } from './geocode.js';
import type { GeocodeCacheStore } from './geocode.js';

export interface ReferencePointsDeps {
  readonly cache: GeocodeCacheStore;
  readonly nowMs: number;
  readonly logger: Logger;
  /** Ce que l'écran Paramètres a enregistré (JSON brut de `app_settings`). */
  readonly stored?: string | null;
}

/**
 * Les points déclarés depuis l'écran Paramètres.
 *
 * TROIS RÉPONSES, ET NON DEUX. Une liste, `'absent'` quand rien n'a jamais été
 * enregistré, `'illisible'` quand une valeur existe mais ne se relit pas.
 *
 * Confondre les deux derniers coûterait cher. Un tableau VIDE est une décision
 * — « je ne veux aucune distance » — et un rescoring peut alors effacer les
 * durées de trajet sans rien détruire. Une valeur ILLISIBLE dit l'inverse :
 * quelqu'un a réglé quelque chose qu'on n'arrive plus à lire, et effacer ses
 * distances serait détruire ce qu'on ne sait pas relire.
 */
type Declared = StoredReferencePoint[] | 'absent' | 'illisible';

function declaredAddresses(stored: string | null | undefined): Declared {
  if (typeof stored !== 'string' || stored.trim() === '') return 'absent';
  try {
    // `parseReferencePoints` rend `null` sur une forme inattendue : du JSON
    // valide qui ne décrit pas des points. C'est illisible au même titre.
    return parseReferencePoints(JSON.parse(stored)) ?? 'illisible';
  } catch {
    return 'illisible';
  }
}

/**
 * Tous les points de référence utilisables, coordonnées et adresses réunies.
 *
 * Une adresse illisible est signalée et ignorée : elle ne doit pas faire échouer
 * une collecte (§69). L'appelant décide si un résultat VIDE est acceptable —
 * il ne l'est pas quand on s'apprête à réécrire des fiches existantes.
 */
export async function resolveReferencePoints(deps: ReferencePointsDeps): Promise<ReferencePoint[]> {
  const points: ReferencePoint[] = [];
  const declared = declaredAddresses(deps.stored);
  // Rien de réglé, ou une valeur qu'on ne sait plus relire : aucun point à
  // résoudre. C'est `referencePointsDeclared` qui dit à l'appelant si ce vide
  // est une décision ou un incident.
  if (!Array.isArray(declared) || declared.length === 0) return points;
  const toGeocode = declared;

  const geocoder = createGeocoder({
    cache: deps.cache,
    nowMs: deps.nowMs,
    userAgent: collectorUserAgent(),
  });

  for (const point of toGeocode) {
    const coords = await geocoder.geocode(point.address);
    if (coords === null) {
      deps.logger.warn('reference.geocode_failed', { label: point.label });
      continue;
    }
    points.push({
      label: point.label,
      latitude: coords.latitude,
      longitude: coords.longitude,
      mode: point.mode,
    });
  }
  return points;
}

/**
 * `true` si des points de référence sont DÉCLARÉS, qu'ils aient été résolus ou
 * non. Sert à distinguer « l'utilisateur n'en veut pas » de « la résolution a
 * échoué » — le second cas doit interrompre un rescoring, sous peine d'effacer
 * les distances de tout l'inventaire.
 */
export function referencePointsDeclared(stored?: string | null): boolean {
  const declared = declaredAddresses(stored);
  // Une valeur illisible compte comme DÉCLARÉE : quelqu'un a réglé quelque
  // chose. Mieux vaut interrompre un rescoring que d'effacer les distances de
  // tout l'inventaire sur une lecture ratée.
  if (declared === 'illisible') return true;
  if (declared === 'absent') return false;
  return declared.length > 0;
}
