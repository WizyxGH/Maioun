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
 * TOUTES SE RETIRENT D'UN CLIC. Les quartiers et le plafond de trajet faisaient
 * exception — sans croix, avec un renvoi au panneau : deux puces qui ne se
 * comportaient pas comme leurs voisines, pour des raisons invisibles à l'écran.
 * Ce qui les retenait a été traité à la source : l'effacement se défait d'un
 * clic (« Annuler »), et « aucun plafond de trajet » s'enregistre vraiment.
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

/** Une restriction venue des critères, telle que la barre l'affiche. */
export interface CriteriaChip {
  readonly label: string;
  /**
   * Ce qu'il faut enregistrer pour lever la restriction. Retirer un critère
   * touche la COLLECTE et les ALERTES, pas seulement l'écran : c'est pour cela
   * que l'effacement garde de quoi revenir en arrière.
   */
  readonly patch: Partial<FilterConfig>;
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
  if (districts.length > 0 && districts.length < NICE_DISTRICTS.length) {
    chips.push({
      label: `${districts.length} quartier${districts.length > 1 ? 's' : ''}`,
      // La liste vide veut dire « toute la commune », côté liste comme côté
      // alertes. L'exclusion des quartiers inconnus part avec elle : seule,
      // elle ne désignerait plus rien.
      patch: { districts: [], includeUnknownDistrict: true },
    });
    // N'a de sens qu'avec des quartiers cochés : sans eux, rien n'est exclu.
    if (criteria.includeUnknownDistrict === false) {
      chips.push({
        label: 'Quartier connu exigé',
        patch: { includeUnknownDistrict: true },
      });
    }
  }

  // Les minutes sont celles qui sont stockées, dans le mode où la collecte a
  // calculé les durées. Le critère absent vaut « aucun plafond » de bout en
  // bout — le serveur ne le comble plus par celui du projet.
  if (criteria.maxCommuteMinutes !== undefined) {
    chips.push({
      label: `Trajet ≤ ${criteria.maxCommuteMinutes} min`,
      patch: { maxCommuteMinutes: undefined },
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

/**
 * Les critères une fois TOUTES leurs puces levées — ce que pose « Effacer
 * tout ».
 *
 * Construit en appliquant les correctifs des puces, et non par une liste de
 * champs recopiée : la barre et l'effacement ne peuvent donc pas diverger. Un
 * critère ajouté demain avec sa puce s'efface du même geste, sans retouche
 * ici.
 *
 * LE PÉRIMÈTRE RESTE : commune, budget, surface. Ce ne sont pas des puces —
 * sans eux il ne resterait rien à chercher.
 */
export function clearedCriteria(criteria: FilterConfig): FilterConfig {
  return criteriaChips(criteria).reduce<FilterConfig>(
    (lifted, chip) => ({ ...lifted, ...chip.patch }),
    criteria,
  );
}
