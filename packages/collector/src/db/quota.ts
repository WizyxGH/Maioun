/**
 * QUAND LA BASE REFUSE DE LIRE, le dire au lieu d'une trace de pile.
 *
 * Turso facture les lignes lues et bloque tout au-delà du plafond mensuel :
 * les requêtes, mais aussi l'export, donc aucune copie de secours. Le
 * 24 septembre 2026 la collecte a échoué toutes les quinze minutes pendant des
 * heures, en rendant « LibsqlError: BLOCKED » et quatre lignes de pile — de
 * quoi croire à un bogue, pas à une facture.
 *
 * Elle échoue toujours, et c'est voulu : une panne réelle ne se masque pas en
 * sortie zéro. Mais elle nomme sa cause, et le geste qui la lève.
 *
 * Une copie de ce diagnostic vit dans `scripts/env.mjs`, pour les outils
 * d'enquête qui tournent sans compilation.
 */

/** Le refus de quota, dit en clair — ou `null` si l'erreur est autre. */
export function readsBlocked(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (!/reads are blocked|read operations are forbidden|BLOCKED/i.test(message)) return null;
  return [
    'La base refuse toute lecture : le quota mensuel de lignes lues est épuisé.',
    "Rien n'a été collecté, et aucune source n'a été sollicitée — l'arrêt a lieu",
    'avant la première requête. Le blocage porte aussi sur l’export, donc sur le',
    'miroir local (`pnpm db:mirror`) : tirez-en un dès que le quota repart.',
    'Relevez le forfait Turso, ou attendez la remise à zéro du cycle.',
  ].join('\n');
}
