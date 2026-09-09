/**
 * D'OÙ VIENT LE PROFIL LOCATAIRE.
 *
 * D'un seul endroit désormais : la base, là où écrit l'écran « Profil
 * locataire ». Il y avait deux sources, et elles ont divergé sans que rien ne
 * le dise — la commande de brouillons lisait les variables `TENANT_*` d'un
 * fichier local. Qui corrigeait son téléphone ou ses revenus dans
 * l'application obtenait des brouillons portant les ANCIENNES valeurs, et ces
 * brouillons-là partent à des agences.
 *
 * Aucune erreur ne pouvait le signaler : le fichier était rempli, la commande
 * n'avait aucune raison de se plaindre. C'est ce silence qui condamne le
 * second domicile, pas sa redondance.
 *
 * La fonction ne parle pas : elle rend ce qu'elle a lu, et l'appelant
 * l'affiche. Un module qui écrit dans la console ne se teste pas.
 */

import { CURRENT_USER, TENANT_PROFILE_SETTING, type TenantProfile } from '@maioun/shared';

/** Ce qui a été lu. */
export interface ResolvedProfile {
  readonly profile: TenantProfile | null;
  /**
   * `true` si la base contenait une valeur ILLISIBLE — écrite par une version
   * antérieure, tronquée. Distinguer ce cas d'un profil absent compte : l'un
   * se corrige en remplissant l'écran, l'autre en comprenant pourquoi ce qu'on
   * y a saisi ne se relit pas.
   */
  readonly storedUnreadable: boolean;
}

/** Ce dont on a besoin d'un dépôt ici, et rien de plus. */
export interface ProfileReader {
  readSettingFor(userId: string, key: string): Promise<string | null>;
}

export async function resolveTenantProfile(reader: ProfileReader): Promise<ResolvedProfile> {
  const stored = await reader.readSettingFor(CURRENT_USER, TENANT_PROFILE_SETTING);
  if (stored === null || stored.trim() === '') {
    return { profile: null, storedUnreadable: false };
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { profile: parsed as TenantProfile, storedUnreadable: false };
    }
    // Du JSON valide qui n'est pas un objet — « null », « [] » — ne vaut pas
    // mieux qu'une valeur illisible : il ne porte aucun profil.
    return { profile: null, storedUnreadable: true };
  } catch {
    return { profile: null, storedUnreadable: true };
  }
}
