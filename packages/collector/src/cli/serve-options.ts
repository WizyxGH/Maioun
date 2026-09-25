/**
 * QUI REGARDE, quand on sert le site en local.
 *
 * À PART DE LA COMMANDE, et il le faut : importer `serve.ts` ouvre un port et
 * une base. Ces deux règles-là se testent sans rien démarrer.
 */

import { CURRENT_USER } from '@maioun/shared';

/**
 * L'identité que le serveur local prête à qui demande.
 *
 * PAR DÉFAUT, LE PROPRIÉTAIRE DE LA MACHINE : il n'y a personne d'autre devant,
 * et le site doit voir ses critères, ses favoris, son dossier.
 *
 * `MAIOUN_LOCAL_ANONYME=1` LE FAIT PASSER VISITEUR, et ce n'est pas un détail
 * de confort. En local on était TOUJOURS connecté ; en ligne, non. Tout ce qui
 * ne se voit que sans compte était donc invisible ici — les deux écrans de
 * connexion enchaînés, et un profil d'avant la liste de garanties qui faisait
 * tomber son écran, n'ont été vus qu'une fois en ligne. C'est l'écart entre les
 * deux mondes qui les a laissés passer, pas leur difficulté.
 */
export function identiteLocale(env: Readonly<Record<string, string | undefined>>): string | null {
  return env['MAIOUN_LOCAL_ANONYME'] === '1' ? null : CURRENT_USER;
}

/** Ce qu'on annonce au démarrage à propos de l'identité servie. */
export function motIdentite(env: Readonly<Record<string, string | undefined>>): string {
  return identiteLocale(env) === null
    ? 'Identité : VISITEUR, sans compte — comme le site public le voit.'
    : 'Identité : votre compte (MAIOUN_LOCAL_ANONYME=1 pour voir en visiteur).';
}
