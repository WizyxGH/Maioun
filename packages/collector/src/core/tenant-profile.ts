/**
 * D'OÙ VIENT LE PROFIL LOCATAIRE, et dans quel ordre.
 *
 * Il y a deux sources, et elles ont divergé sans que rien ne le dise :
 * l'écran « Profil locataire » écrit dans `app_settings`, tandis que
 * `pnpm draft` lisait les variables `TENANT_*` du `.env`. Qui corrige son
 * téléphone ou ses revenus dans l'application, puis lance la commande, obtenait
 * des brouillons portant les ANCIENNES valeurs — et ces brouillons-là partent à
 * des agences. Aucune erreur ne pouvait le signaler : le `.env` était rempli,
 * la commande n'avait aucune raison de se plaindre.
 *
 * LA BASE FAIT DONC AUTORITÉ : c'est là qu'écrit l'écran, donc là où
 * l'utilisateur croit avoir corrigé son dossier. Le `.env` reste un SECOURS,
 * pour une machine qui collecte sans que personne ait jamais ouvert l'écran.
 *
 * La fonction ne parle pas : elle rend la source retenue, et l'appelant
 * l'affiche. Un module qui écrit dans la console ne se teste pas.
 */

import { CURRENT_USER, TENANT_PROFILE_SETTING, type TenantProfile } from '@rentfinder/shared';

/** Ce qui a été lu, et d'où. */
export interface ResolvedProfile {
  readonly profile: TenantProfile | null;
  /** `null` quand aucune des deux sources n'a rien donné. */
  readonly source: 'application' | 'env' | null;
  /**
   * `true` si la base contenait une valeur ILLISIBLE — écrite par une version
   * antérieure, tronquée. On retombe alors sur le `.env`, mais il faut le dire :
   * sinon la commande semble avoir lu l'application alors qu'elle ne l'a pas pu.
   */
  readonly storedUnreadable: boolean;
}

/** Ce dont on a besoin d'un dépôt ici, et rien de plus. */
export interface ProfileReader {
  readSettingFor(userId: string, key: string): Promise<string | null>;
}

export async function resolveTenantProfile(
  reader: ProfileReader,
  fromEnv: () => TenantProfile | null,
): Promise<ResolvedProfile> {
  let storedUnreadable = false;
  const stored = await reader.readSettingFor(CURRENT_USER, TENANT_PROFILE_SETTING);

  if (stored !== null && stored.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { profile: parsed as TenantProfile, source: 'application', storedUnreadable: false };
      }
      // Du JSON valide qui n'est pas un objet — `"null"`, `"[]"` — ne vaut pas
      // mieux qu'une valeur illisible : il ne porte aucun profil.
      storedUnreadable = true;
    } catch {
      storedUnreadable = true;
    }
  }

  const env = fromEnv();
  return { profile: env, source: env === null ? null : 'env', storedUnreadable };
}
