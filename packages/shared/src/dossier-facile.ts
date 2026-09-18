/**
 * LE DOSSIER VÉRIFIÉ DE L'ÉTAT, joint aux candidatures.
 *
 * DossierFacile est un service public : le candidat y dépose ses pièces, elles
 * sont contrôlées, et il obtient un lien partageable vers un dossier filigrané.
 * Un bailleur qui reçoit un dossier déjà vérifié répond plus volontiers qu'à
 * une candidature nue — et sur un marché où trente personnes visitent le même
 * studio, c'est ce qui départage.
 *
 * ON NE GARDE QUE LE LIEN, jamais les pièces : c'est DossierFacile qui les
 * héberge et les contrôle. Moins de données personnelles ici, et un dossier
 * qui reste à jour sans qu'on s'en occupe.
 *
 * L'ADRESSE EST VÉRIFIÉE, ET C'EST INDISPENSABLE. Ce lien part dans des
 * messages adressés à des agences : accepter n'importe quelle adresse ferait
 * de l'application un relais d'hameçonnage, au nom de l'utilisateur. Seul le
 * domaine officiel est accepté, en HTTPS.
 */

/** Le domaine du service ; ses sous-domaines sont acceptés, rien d'autre. */
const OFFICIAL_HOST = 'dossierfacile.logement.gouv.fr';

/**
 * L'adresse si c'est bien un lien DossierFacile officiel, `null` sinon.
 *
 * Rend l'adresse NORMALISÉE — espaces retirés — pour que la comparaison et
 * l'affichage portent sur la même chose.
 */
export function dossierFacileLink(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  // `endsWith` seul laisserait passer « dossierfacile.logement.gouv.fr.pirate.fr » :
  // il faut le domaine exact, ou un de ses sous-domaines.
  if (host !== OFFICIAL_HOST && !host.endsWith(`.${OFFICIAL_HOST}`)) return null;
  return parsed.toString();
}

/** Ce qu'on affiche à qui n'a pas encore de dossier. */
export const DOSSIER_FACILE_HOME = 'https://www.dossierfacile.logement.gouv.fr/';
