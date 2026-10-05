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
 * L'alias que le service redirige vers le domaine officiel, sous-domaine et
 * chemin compris (`locataire.dossierfacile.fr/file/…` → `locataire.
 * dossierfacile.logement.gouv.fr/file/…`, vérifié le 2026-10-05).
 */
const ALIAS_HOST = 'dossierfacile.fr';

/** Le domaine exact, ou un de ses sous-domaines — pas un domaine qui le prolonge. */
function sous(host: string, domaine: string): boolean {
  // `endsWith` seul laisserait passer « dossierfacile.logement.gouv.fr.pirate.fr ».
  return host === domaine || host.endsWith(`.${domaine}`);
}

/**
 * L'adresse si c'est bien un lien DossierFacile officiel, `null` sinon.
 *
 * Rend l'adresse NORMALISÉE, et c'est elle qui part dans les messages : en
 * HTTPS, sur le domaine officiel, sans les espaces d'un copier-coller.
 *
 * LES BONNES ADRESSES PASSENT TOUTES. On refusait l'alias `dossierfacile.fr`
 * que le service distribue, un lien collé sans `https://`, ou écrit en
 * `http://` : autant de vrais dossiers déclarés « pas une adresse
 * DossierFacile ». Le domaine reste la seule porte, et c'est lui qui protège
 * de l'hameçonnage ; le schéma, lui, est réécrit.
 */
export function dossierFacileLink(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username !== '' || parsed.password !== '' || parsed.port !== '') return null;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (sous(host, OFFICIAL_HOST)) {
    parsed.hostname = host;
  } else if (sous(host, ALIAS_HOST)) {
    parsed.hostname = `${host.slice(0, -ALIAS_HOST.length)}${OFFICIAL_HOST}`;
  } else {
    return null;
  }
  parsed.protocol = 'https:';
  return parsed.toString();
}

/** Ce qu'on affiche à qui n'a pas encore de dossier. */
export const DOSSIER_FACILE_HOME = 'https://www.dossierfacile.logement.gouv.fr/';
