/**
 * LES CRITÈRES DU COMPTE, et le moyen de les lever.
 *
 * DEUX ÉTAGES FILTRENT, et les confondre a déjà coûté cher. Les FILTRES RAPIDES
 * affinent dans le navigateur une liste déjà reçue ; les CRITÈRES, eux, sont
 * appliqués par le serveur — les lever demande une écriture et un rechargement.
 * Ce module ne tient que le second étage ; le premier reste dans l'écran, où il
 * n'engage rien.
 *
 * TOUT CE QUI TOUCHE AUX CRITÈRES ÉCRIT D'ABORD À L'ÉCRAN, puis en base, et
 * REVIENT EN ARRIÈRE SI L'ÉCRITURE ÉCHOUE. Une puce doit disparaître sous le
 * doigt ; mais une puce retirée alors que le filtre tient encore ferait croire
 * à un catalogue qu'on ne voit pas.
 *
 * Réuni ici parce que l'état, sa lecture initiale, son retour arrière et les
 * trois gestes qui le modifient formaient un même sujet éparpillé sur mille
 * lignes d'`App` — et que le retour arrière tient à une invariante qu'on ne
 * peut pas respecter de loin : l'écran et le navigateur retiennent LA MÊME
 * chose, ou une rangée « Annuler » survit au geste qu'elle défait.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FilterConfig } from './types.js';
import { fetchFilters, saveFilters } from './api/client.js';
import {
  forgetCleared,
  recallCleared,
  rememberCleared,
  type ClearedCriteria,
} from './cleared-criteria.js';
import { clearedCriteria, criteriaChips } from './criteria-chips.js';

export interface CriteriaParams {
  /** `undefined` tant qu'on ne sait pas qui regarde, `null` pour un visiteur. */
  readonly currentUser: string | null | undefined;
  /** Recharge la liste : le serveur filtre là-dessus. */
  readonly reload: () => Promise<void> | void;
  readonly onError: (message: string) => void;
}

export interface CriteriaControls {
  /** `null` tant qu'on ne les a pas : on ne devine pas des filtres. */
  readonly criteria: FilterConfig | null;
  /** De quoi défaire le dernier « Effacer tout », ou `null`. */
  readonly clearedUndo: ClearedCriteria | null;
  /** Les critères viennent d'être écrits ailleurs : on s'aligne. */
  readonly adoptCriteria: (next: FilterConfig) => void;
  /** Lève un seul critère — le retrait d'une puce. */
  readonly relaxCriterion: (patch: Partial<FilterConfig>) => Promise<void>;
  /** Lève tout ce qui peut l'être, en gardant de quoi revenir en arrière. */
  readonly clearEveryCriterion: () => Promise<void>;
  /** Remet les critères d'avant l'effacement. */
  readonly undoClear: () => Promise<void>;
  /** Retire la rangée « Annuler » sans rien rétablir. */
  readonly forgetUndo: () => void;
}

export function useCriteria({ currentUser, reload, onError }: CriteriaParams): CriteriaControls {
  const [criteria, setCriteria] = useState<FilterConfig | null>(null);
  const [clearedUndo, setClearedUndo] = useState<ClearedCriteria | null>(null);

  /**
   * Pose le retour arrière, ou l'oublie — À L'ÉCRAN ET DANS LE NAVIGATEUR.
   *
   * Deux mémoires pour une seule notion : les tenir séparément, c'est s'exposer
   * à une rangée « Annuler » qui a survécu au geste qu'elle défait, ou disparu
   * alors qu'il valait encore.
   */
  const keepUndo = useCallback((memo: ClearedCriteria | null): void => {
    setClearedUndo(memo);
    if (memo === null) forgetCleared();
    else rememberCleared(memo);
  }, []);

  // Une fois : ils ne changent ensuite que par le panneau de la modale, qui
  // rend ce qu'il écrit. Un visiteur sans compte n'en a pas — la demande n'est
  // même pas émise.
  useEffect(() => {
    if (currentUser === undefined || currentUser === null) return;
    void fetchFilters()
      .then((config) => {
        setCriteria(config);
        // Le retour arrière du dernier « Effacer tout » revient avec eux, s'il
        // vaut encore : c'est ici, et pas ailleurs, qu'on sait ce que le compte
        // porte vraiment.
        setClearedUndo(recallCleared(config));
      })
      .catch(() => undefined);
  }, [currentUser]);

  const adoptCriteria = useCallback(
    (next: FilterConfig): void => {
      setCriteria(next);
      // Le retour arrière ne vaut plus : il remettrait les critères d'avant
      // l'effacement, donc aussi celui qu'on vient de changer exprès. Un
      // « Annuler » ne défait que le geste qu'il annonce.
      keepUndo(null);
    },
    [keepUndo],
  );

  const relaxCriterion = useCallback(
    async (patch: Partial<FilterConfig>): Promise<void> => {
      if (criteria === null) return;
      const previous = criteria;
      const next = { ...criteria, ...patch };
      adoptCriteria(next);
      try {
        await saveFilters(next);
        await reload();
      } catch {
        setCriteria(previous);
        onError('Ce critère n’a pas pu être modifié');
      }
    },
    [criteria, adoptCriteria, reload, onError],
  );

  /**
   * « EFFACER TOUT » EFFACE TOUT — critères de recherche compris.
   *
   * Il ne touchait qu'à l'affichage, et une phrase sous les puces expliquait que
   * les critères, eux, continuaient d'écarter des annonces. Demande de
   * l'utilisateur : ni la phrase, ni l'exception. Une barre où l'on retire les
   * puces une à une et un lien qui n'en retire que la moitié ne peuvent pas
   * cohabiter.
   *
   * CE QUI RESTE : la commune, le budget et la surface. Ce ne sont pas des puces
   * — c'est le périmètre de l'outil, et sans eux il n'y a plus de recherche.
   */
  const clearEveryCriterion = useCallback(async (): Promise<void> => {
    const previous = criteria;
    if (previous === null) return;
    const chips = criteriaChips(previous);
    if (chips.length === 0) return;
    const next = clearedCriteria(previous);
    setCriteria(next);
    // `cleared` sert à vérifier, au prochain chargement, que rien n'a bougé
    // depuis : sans lui, « Annuler » écraserait des critères réglés entre-temps.
    keepUndo({ previous, cleared: next, labels: chips.map((chip) => chip.label) });
    try {
      await saveFilters(next);
      await reload();
    } catch {
      setCriteria(previous);
      keepUndo(null);
      onError('Les critères n’ont pas pu être effacés');
    }
  }, [criteria, keepUndo, reload, onError]);

  /**
   * SI L'ÉCRITURE ÉCHOUE, LE BOUTON REVIENT. Sans cela, l'écran afficherait des
   * critères rétablis que le serveur ne connaît pas, et le seul moyen de les
   * rétablir vraiment aurait disparu avec la rangée : la perte silencieuse
   * qu'on cherche précisément à éviter.
   */
  const undoClear = useCallback(async (): Promise<void> => {
    const pending = clearedUndo;
    if (pending === null) return;
    const cleared = criteria;
    setCriteria(pending.previous);
    keepUndo(null);
    try {
      await saveFilters(pending.previous);
      await reload();
    } catch {
      setCriteria(cleared);
      keepUndo(pending);
      onError('Vos critères n’ont pas pu être rétablis');
    }
  }, [clearedUndo, criteria, keepUndo, reload, onError]);

  const forgetUndo = useCallback((): void => keepUndo(null), [keepUndo]);

  return {
    criteria,
    clearedUndo,
    adoptCriteria,
    relaxCriterion,
    clearEveryCriterion,
    undoClear,
    forgetUndo,
  };
}
