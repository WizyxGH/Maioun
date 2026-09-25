/**
 * Ce que `pnpm local` décide avant de lancer quoi que ce soit.
 *
 * À PART DE LA COMMANDE, et il le faut : importer `local.ts` démarre un serveur
 * ET une collecte. Un test qui voudrait vérifier ces règles solliciterait de
 * vrais sites.
 */

/** La cadence demandée, ou le motif du refus. */
export function cadence(arguments_: readonly string[]): { minutes: number } | { refus: string } {
  const index = arguments_.indexOf('--toutes');
  if (index === -1) return { minutes: 30 };
  // `--toutes` SANS VALEUR est une faute de frappe, pas une absence d'option :
  // retomber en silence sur la cadence par défaut donnerait une autre cadence
  // que celle demandée, sans le dire.
  const brut = arguments_[index + 1];
  const minutes = Number(brut);
  // EN DEÇÀ DE CINQ MINUTES ON HARCÈLE LES SITES, et une collecte complète dure
  // de toute façon plus longtemps : la cadence serait un mensonge.
  if (!Number.isFinite(minutes) || minutes < 5) {
    return { refus: '`--toutes` attend un nombre de minutes ≥ 5 : en deçà, on harcèle les sites.' };
  }
  return { minutes };
}

/**
 * L'environnement des deux processus fils.
 *
 * `MAIOUN_LOCAL` IMPOSÉ, et ce n'est pas un détail : sans lui, un `.env`
 * renseigné enverrait la collecte écrire dans Turso — la production, depuis une
 * commande qui dit « local ».
 *
 * `MAIOUN_LOCAL_DB` l'est aussi : `serve.ts` prend le miroir en priorité, et
 * l'on servirait alors une copie figée pendant que la collecte remplit un AUTRE
 * fichier. L'écran ne bougerait pas, sans que rien ne l'explique.
 *
 * `MAIOUN_ALERTS` N'EST PAS TOUCHÉ : ni posé, ni retiré. Cette commande n'a pas
 * à décider si les alertes partent — elle le DIT au démarrage, c'est tout.
 */
export function environnementLocal(
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return { ...base, MAIOUN_LOCAL: '1', MAIOUN_LOCAL_DB: 'data/local.db' };
}

/** Ce qu'on annonce au démarrage à propos des alertes. */
export function motAlertes(base: Readonly<Record<string, string | undefined>>): string {
  return base['MAIOUN_ALERTS'] === undefined
    ? 'Alertes : aucune ne partira (MAIOUN_ALERTS non posé).'
    : 'ATTENTION : MAIOUN_ALERTS est posé — les alertes PARTIRONT à chaque passage.';
}
