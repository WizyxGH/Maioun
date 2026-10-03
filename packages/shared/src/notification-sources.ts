/**
 * Le filtre par source des NOTIFICATIONS — le même que celui de la liste, mais
 * là où la collecte peut le lire.
 *
 * LE FILTRE DE LA LISTE EST RESTÉ DANS LE NAVIGATEUR. Cocher « LocService »
 * cachait les annonces à l'écran et n'empêchait rien : la notification partait
 * quand même, et c'est elle qu'on ne peut pas ignorer. Cocher une case ne peut
 * pas vouloir dire « continue de me sonner » — ce que l'utilisateur exclut de
 * l'écran exclut la sonnerie, sans quoi il faut deux réglages pour une seule
 * intention.
 *
 * LE MODE EST REPRIS TEL QUEL, et c'est délibéré : il ne dit pas quelles
 * sources existent, mais ce qu'on a voulu. « Toutes sauf LocService » reste vrai
 * quand une agence est ajoutée le lendemain ; « seulement celles-ci » ne se
 * périme pas non plus. On ne fige donc jamais une liste de 225 sources en base.
 */

import type { SourceId } from './provenance.js';

/** Ce qu'on fait des sources nommées : les garder, ou les écarter. */
export type NotificationSourceMode = 'only' | 'except';

export interface NotificationSourceSelection {
  readonly mode: NotificationSourceMode;
  readonly ids: readonly SourceId[];
}

/**
 * AUCUNE RESTRICTION.
 *
 * C'est le défaut, et non « toutes les sources » figées : un compte qui n'a
 * jamais touché au filtre doit recevoir ce que la liste montre.
 */
export const ALL_NOTIFICATION_SOURCES: NotificationSourceSelection = {
  mode: 'except',
  ids: [],
};

/**
 * Relit ce qui est en base, et complète par le défaut.
 *
 * RIGOUREUX À VOLONTÉ, parce qu'une liste illisible se lirait sinon comme «
 * toutes les sources » ou « aucune » — les deux_font sonner, ou taire, pour la
 * mauvaise raison. Tout ce qui n'est pas la forme attendue retombe sur « aucune
 * restriction », qui est le seul état qui ne change rien au comportement.
 *
 * Les doublons sont retirés : ils venaient d'un ancien format, et une liste
 * quatre fois-named ne dit rien de plus.
 */
export function parseNotificationSources(stored: unknown): NotificationSourceSelection {
  if (typeof stored !== 'object' || stored === null) return ALL_NOTIFICATION_SOURCES;
  const brut = stored as { mode?: unknown; ids?: unknown };
  if (brut.mode !== 'only' && brut.mode !== 'except') return ALL_NOTIFICATION_SOURCES;
  if (!Array.isArray(brut.ids)) return ALL_NOTIFICATION_SOURCES;
  const ids = [...new Set(brut.ids.filter((id): id is string => typeof id === 'string'))];
  if (ids.length === 0) return ALL_NOTIFICATION_SOURCES;
  return { mode: brut.mode, ids };
}

/** `true` si la sélection écarte quoi que ce soit. */
export function restrictsNotificationSources(selection: NotificationSourceSelection): boolean {
  return selection.ids.length > 0;
}

/**
 * Le prédicat SQL, et les arguments à lui passer.
 *
 * ON PASSE PAR `occurrences.group_id`, pas par une colonne de `listings` :
 * une fiche dédoublonnée vient de plusieurs sources, et c'est justement pour ça
 * qu'on filtre. Un `NOT EXISTS` plutôt qu'un `IN` : une annonce exclue par UNE
 * de ses sources est exclue, ce qui est ce que dit un filtre de source — et ce
 * que la liste fait déjà, puisqu'elle affiche la source principale de la fiche.
 *
 * AUCUNE RESTRICTION NE REND AUCUN FILTRE : le SQL est vide et la liste
 * d'arguments aussi. Rien à maintenir, et aucune requête ne change quand
 * personne n'a filtré.
 */
export function sourceFilterSql(selection: NotificationSourceSelection): {
  sql: string;
  args: SourceId[];
} {
  if (!restrictsNotificationSources(selection)) return { sql: '', args: [] };
  const placeholders = selection.ids.map(() => '?').join(', ');
  // LES DEUX MODES ONT LEURS DEUX SENS, et ne pas traiter « seulement » comme
  // « sauf » donnerait une liste blanche qui n'écarte rien : elle afficherait et
  // signalerait TOUT, en laissant croire qu'elle était restreinte. Un filtre
  // qui ne filtre pas en silence est pire que pas de filtre du tout.
  const predicat =
    selection.mode === 'only'
      ? `EXISTS (
            SELECT 1 FROM occurrences AS src
            WHERE src.group_id = listings.id
              AND src.source_id IN (${placeholders})
          )`
      : `NOT EXISTS (
            SELECT 1 FROM occurrences AS src
            WHERE src.group_id = listings.id
              AND src.source_id IN (${placeholders})
          )`;
  return { sql: predicat, args: [...selection.ids] };
}

/**
 * Clé dans `app_settings`.
 *
 * MÊME RÔLE QUE `notificationPreferences`, et même raison : c'est le seul endroit
 * où le site et la collecte se retrouvent. Le filtre de la liste reste dans le
 * navigateur — il ne concerne que l'affichage, et n'a rien à faire dans une
 * alerte.
 */
export const NOTIFICATION_SOURCES_SETTING = 'notificationSources';
