/**
 * LA PASTILLE SUR L'ICÔNE DE L'APPLICATION.
 *
 * Le compte des annonces non lues vivait uniquement DANS l'application : il
 * fallait l'ouvrir pour savoir s'il y avait du neuf. Sur un téléphone où
 * Maïoun est installé, l'icône peut le dire d'elle-même — c'est le même
 * chiffre que la cloche, au même endroit que les badges des autres
 * applications.
 *
 * TOUT EST FACULTATIF ICI, et le code doit le supporter sans broncher :
 *
 *   - l'API n'existe pas sur tous les navigateurs (Firefox, Safari hors
 *     application installée) ;
 *   - elle LÈVE dans certains contextes — onglet non installé sur Chrome
 *     Android, fenêtre privée — au lieu de rendre `false` ;
 *   - elle ne fait rien de visible tant que l'application n'est pas installée,
 *     et c'est très bien : poser la pastille ne coûte rien et ne dérange
 *     personne.
 *
 * On ne demande donc AUCUNE permission et on ne prévient de rien : une API
 * absente est un non-événement, pas une panne (§17, §69).
 */

interface BadgeCapable {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Pose le compte sur l'icône, ou l'efface à zéro.
 *
 * ZÉRO EFFACE PLUTÔT QUE D'AFFICHER « 0 » : une pastille qui annonce rien est
 * une pastille de trop, et certaines plateformes la dessinent quand même.
 */
export function showAppBadge(count: number): void {
  const api = navigator as unknown as BadgeCapable;
  try {
    if (count > 0) {
      void api.setAppBadge?.(count).catch(() => undefined);
      return;
    }
    void api.clearAppBadge?.().catch(() => undefined);
  } catch {
    // API présente mais refusée par le contexte : rien à dire, rien à faire.
  }
}
