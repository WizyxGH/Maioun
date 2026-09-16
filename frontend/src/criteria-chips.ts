/**
 * Ce que les CRITÈRES retirent de la liste, dit en puces.
 *
 * LA MOITIÉ DES FILTRES NE SE VOYAIT PAS. La barre de puces et la pastille du
 * bouton « Filtres » ne comptaient que les filtres du navigateur — budget,
 * surface, pièces, types, recherche, sources, bascules. Les critères, réglés
 * dans la même modale et appliqués par le serveur, n'y figuraient pas : on
 * lisait « 3 » avec 87 quartiers cochés, deux exclusions et un plafond de
 * trajet en vigueur.
 *
 * LA RÈGLE, ET ELLE TIENT DES DEUX CÔTÉS : une puce affichée = un filtre
 * compté, et tout ce qui écarte des annonces a sa puce.
 *
 * LE BUDGET ET LA SURFACE N'EN SONT PAS. Ils existent des deux côtés — les
 * filtres rapides s'ouvrent sur les valeurs des critères. Ce sont LES FILTRES
 * RAPIDES QUI FONT FOI : eux seuls portent une puce, parce qu'eux seuls se
 * retirent d'un clic et parce que ce sont eux qui filtrent l'écran. Les
 * recompter ici doublerait la pastille.
 *
 * LA COMMUNE NON PLUS : c'est le périmètre de l'outil, pas un filtre qu'on
 * retire — sans elle il ne resterait rien à chercher.
 */

import { NICE_DISTRICTS } from '@maioun/shared';
import type { FilterConfig } from './types.js';

/** Ce qu'on écrit sur une puce qu'un clic ne peut pas retirer sans surprise. */
export const IN_FILTERS_PANEL = 'à régler dans Filtres';

/** Une restriction venue des critères, telle que la barre l'affiche. */
export interface CriteriaChip {
  readonly label: string;
  /**
   * Ce qu'il faut enregistrer pour lever la restriction, ou `null` quand elle
   * ne se retire pas d'un clic. Retirer un critère touche la COLLECTE et les
   * ALERTES, pas seulement l'écran : la puce dit alors où le régler.
   */
  readonly patch: Partial<FilterConfig> | null;
  /** Où se règle une puce non retirable — affiché à côté de son intitulé. */
  readonly hint?: string;
}

/** « 2026-10-01 » → « 01/10/2026 », sans passer par un fuseau horaire. */
function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-');
  return day === undefined ? iso : `${day}/${month}/${year}`;
}

/**
 * Les critères qui écartent des annonces, un par un.
 *
 * @param criteria `null` tant qu'ils ne sont pas chargés, ou pour un visiteur
 *   sans compte : aucune puce plutôt qu'une promesse inventée.
 */
export function criteriaChips(criteria: FilterConfig | null): readonly CriteriaChip[] {
  if (criteria === null) return [];
  const chips: CriteriaChip[] = [];

  const districts = criteria.districts ?? [];
  // TOUS LES QUARTIERS COCHÉS NE RESTREINT RIEN : pas de puce, sinon elle
  // resterait allumée en permanence sans rien écarter.
  //
  // NON RETIRABLE, ET C'EST DIT. Une croix effacerait 87 quartiers choisis un à
  // un, que rien ne permettrait de retrouver ; elle élargirait au passage la
  // collecte et les alertes à toute la ville. On la montre et on renvoie au
  // panneau, plutôt que de la cacher — c'est le plus gros des filtres.
  if (districts.length > 0 && districts.length < NICE_DISTRICTS.length) {
    chips.push({
      label: `${districts.length} quartier${districts.length > 1 ? 's' : ''}`,
      patch: null,
      hint: IN_FILTERS_PANEL,
    });
    // N'a de sens qu'avec des quartiers cochés : sans eux, rien n'est exclu.
    if (criteria.includeUnknownDistrict === false) {
      chips.push({
        label: 'Quartier connu exigé',
        patch: { includeUnknownDistrict: true },
      });
    }
  }

  // LE PLAFOND DE TRAJET NE SE RETIRE PAS D'ICI. Le serveur comble un critère
  // absent par celui du projet (60 min) : une croix l'effacerait à l'écran et
  // il reviendrait au rechargement. Tant que « aucun plafond » ne s'enregistre
  // pas, la puce renvoie au panneau. Les minutes sont celles qui sont
  // stockées, dans le mode où la collecte a calculé les durées.
  if (criteria.maxCommuteMinutes !== undefined) {
    chips.push({
      label: `Trajet ≤ ${criteria.maxCommuteMinutes} min`,
      patch: null,
      hint: IN_FILTERS_PANEL,
    });
  }

  if (criteria.excludeFlatShare === true) {
    chips.push({ label: 'Sans colocations', patch: { excludeFlatShare: false } });
  }
  if (criteria.excludeStudent === true) {
    chips.push({ label: 'Sans logements étudiants', patch: { excludeStudent: false } });
  }
  if (criteria.availableBy !== undefined && criteria.availableBy !== '') {
    chips.push({
      label: `Dispo. avant le ${formatDay(criteria.availableBy)}`,
      patch: { availableBy: '' },
    });
  }
  if (criteria.landlordFilter === 'private' || criteria.landlordFilter === 'agency') {
    chips.push({
      label: criteria.landlordFilter === 'private' ? 'Particuliers' : 'Agences',
      patch: { landlordFilter: 'all' },
    });
  }
  if (criteria.furnishedFilter === 'furnished' || criteria.furnishedFilter === 'unfurnished') {
    chips.push({
      label: criteria.furnishedFilter === 'furnished' ? 'Meublé' : 'Non meublé',
      patch: { furnishedFilter: 'all' },
    });
  }
  return chips;
}
