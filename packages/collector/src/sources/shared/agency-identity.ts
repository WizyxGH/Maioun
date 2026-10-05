import type { SourceDescriptor } from '@maioun/shared';

/**
 * L'IDENTITÉ PUBLIQUE D'UNE AGENCE, telle qu'une fabrique la reporte de sa
 * configuration vers le descripteur : ses coordonnées et son icône.
 *
 * Un seul endroit, pour qu'aucune fabrique n'oublie l'un des deux : trois
 * d'entre elles ignoraient le logo, et leurs agences retombaient sur l'icône
 * de la plateforme.
 */
export interface IdentiteAgence {
  /** Coordonnées publiques de l'agence (adresse de vitrine, ligne générale). */
  readonly agencyContact?: SourceDescriptor['agencyContact'];
  /**
   * L'icône que le site déclare dans sa page. Indispensable quand
   * `/favicon.ico` n'est pas la sienne : Apimo y sert la même icône pour
   * toutes ses agences, et l'écran les affichait toutes sous le même logo.
   */
  readonly logo?: string;
}

export function identiteAgence(config: IdentiteAgence): IdentiteAgence {
  return {
    ...(config.agencyContact !== undefined ? { agencyContact: config.agencyContact } : {}),
    ...(config.logo !== undefined ? { logo: config.logo } : {}),
  };
}
