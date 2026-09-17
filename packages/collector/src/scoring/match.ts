/**
 * MATCH SCORE — « cette annonce correspond-elle à mes critères ? » (§16).
 *
 * Le score est construit à partir des critères actifs uniquement. Ajouter un
 * critère (quartier, DPE, balcon…) revient à ajouter une règle ici, sans
 * toucher au reste du système (§2).
 */

import type {
  AggregatedListing,
  ExplainedScore,
  ScoreReason,
  SearchCriteria,
} from '@maioun/shared';
import { clampScore, rentForBudget } from '@maioun/shared';
import { comparable } from '../normalization/text.js';
import {
  isShortTermStudentLease,
  isStudentOnlyHousing,
} from '../normalization/parse-listing-fields.js';

export interface MatchOutcome {
  readonly score: ExplainedScore;
  /**
   * `false` si l'annonce viole un critère éliminatoire (§53 scénario 3).
   * Elle reste collectée et consultable, mais sort de la liste principale.
   */
  readonly matchesCriteria: boolean;
}

/**
 * Codes postaux des communes cibles connues.
 *
 * Sert à trancher la ville quand la source ne la NOMME pas mais publie un code
 * postal (§17 : on ne devine rien, on recoupe une donnée réellement publiée).
 * Sans cette table, une annonce à Saint-Laurent-du-Var (06700) dont le champ
 * « ville » est vide passait le filtre « Nice ». Étendre si de nouvelles villes
 * cibles sont ajoutées aux critères.
 */
const CITY_POSTAL_CODES: Readonly<Record<string, readonly string[]>> = {
  nice: ['06000', '06100', '06200', '06300'],
};

/**
 * Détection d'une location EXCLUSIVEMENT étudiante (décision utilisateur du
 * 2026-08-16) : on n'exclut QUE les offres réservées aux étudiants — résidence
 * étudiante, bien « réservé/exclusivement étudiants », CROUS, bail étudiant,
 * bail mobilité, ou offre dédiée dans l'URL (`location-etudiants`). Un bien qui
 * SEULEMENT accepte des étudiants (« idéal étudiant », « étudiants acceptés »)
 * est conservé — deux cents annonces de l'inventaire portent ce genre de
 * formule, et la plupart sont de vrais logements à l'année.
 *
 * S'y ajoute le bail de NEUF MOIS (septembre → juin, saisonnier l'été) : il ne
 * se distingue d'une résidence étudiante que par la forme, pas par l'effet —
 * on ne peut pas y habiter à l'année.
 *
 * LA DÉFINITION EST CELLE DE LA NORMALISATION, pas une seconde écrite ici.
 * `isStudentOnlyHousing` sert aussi à poser l'atout « Réservé aux étudiants »
 * sur la carte : si les deux divergeaient, l'utilisateur verrait un badge sur
 * une annonce non exclue, ou l'inverse.
 */
export function isStudentHousing(listing: AggregatedListing): boolean {
  const raw = `${listing.title.value ?? ''} ${listing.description.value ?? ''}`;
  if (isStudentOnlyHousing(raw)) return true;
  if (isShortTermStudentLease(raw)) return true;
  return listing.occurrences.some((occurrence) => dedicatedStudentUrl(occurrence.sourceUrl));
}

/** Le mot qui désigne une offre étudiante dans une adresse. */
const STUDENT_URL_MARKER = /location-etudiants?|logement-etudiants?/i;

/**
 * `true` si l'adresse désigne une offre DÉDIÉE aux étudiants.
 *
 * LE MÊME MOT DIT DEUX CHOSES SELON OÙ IL SE TROUVE, et les confondre écartait
 * un portail entier. Chez une agence, le marqueur est glissé dans le slug du
 * bien lui-même — « …/location+appartement+nice+location-etudiants+86 » chez
 * Dazur : il qualifie CE bien, que l'agence a rangé dans son offre étudiante.
 * Sur un portail étudiant, c'est la PREMIÈRE case du chemin, la rubrique par
 * laquelle passent toutes ses locations — « /location-etudiant/nice-06/… »
 * chez ImmoJeune : elle qualifie le site, et ne dit rien du bien.
 *
 * La différence n'est pas une subtilité : les annonces d'ImmoJeune sont des
 * studios et des deux-pièces ordinaires, sans condition d'étudiant, dont le
 * formulaire de candidature propose « Salarié ». Toutes portaient ce mot dans
 * leur adresse, et toutes se seraient donc exclues d'elles-mêmes.
 *
 * Le texte, lui, continue de trancher dans les deux cas : une annonce de
 * portail étudiant qui dit « bail étudiant » est exclue comme les autres.
 */
function dedicatedStudentUrl(sourceUrl: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(sourceUrl).pathname;
  } catch {
    return STUDENT_URL_MARKER.test(sourceUrl);
  }
  const segments = pathname.split('/').filter((segment) => segment !== '');
  // La rubrique d'un site n'est pas une qualité du bien : on saute la première.
  return segments.slice(1).some((segment) => STUDENT_URL_MARKER.test(segment));
}

/** Évalue la correspondance d'un logement aux critères de recherche. */
interface CityOutcome {
  /** `false` si la ville est éliminatoire (hors zone). */
  readonly matches: boolean;
  /** `true` si la ville n'a pas pu être déterminée (§17). */
  readonly unknown: boolean;
  readonly points: number;
  readonly reason: ScoreReason;
}

/**
 * Détermine si la ville de l'annonce est dans la zone recherchée.
 *
 * Ordre : nom de ville quand il est publié ; sinon recoupement par CODE POSTAL
 * (écarte Saint-Laurent-du-Var 06700 d'une recherche « Nice » même si le champ
 * ville est vide) ; sinon on n'élimine pas, faute de signal (§17).
 */
function evaluateCity(listing: AggregatedListing, criteria: SearchCriteria): CityOutcome {
  const postalCode = listing.postalCode.value;
  const targetPostalCodes = criteria.cities.flatMap(
    (wanted) => CITY_POSTAL_CODES[comparable(wanted)] ?? [],
  );

  // Le CODE POSTAL fait AUTORITÉ quand il est connu : une commune voisine
  // (06210 Mandelieu ≠ Nice) ou une mention trompeuse comme « à 33 km de Nice »
  // ne doit pas passer le filtre à cause du seul nom de ville (§16).
  if (postalCode !== null && targetPostalCodes.length > 0) {
    return targetPostalCodes.includes(postalCode)
      ? {
          matches: true,
          unknown: false,
          points: 30,
          reason: cityReason('match', `Code postal ${postalCode}`),
        }
      : {
          matches: false,
          unknown: false,
          points: 0,
          reason: cityReason('mismatch', `Hors zone (code postal ${postalCode})`),
        };
  }

  // Sans code postal : on se rabat sur le nom de ville.
  const city = listing.city.value;
  if (city !== null) {
    const inZone = criteria.cities.some((wanted) => city.includes(comparable(wanted)));
    return inZone
      ? {
          matches: true,
          unknown: false,
          points: 30,
          reason: cityReason('match', `Située à ${city}`),
        }
      : {
          matches: false,
          unknown: false,
          points: 0,
          reason: cityReason('mismatch', `Hors zone recherchée (${city})`),
        };
  }

  // Ni ville ni code postal exploitable : on n'élimine pas (§17).
  return {
    matches: true,
    unknown: true,
    points: 0,
    reason: cityReason('unknown', 'Ville non précisée par la source'),
  };
}

const cityReason = (suffix: string, label: string): ScoreReason => ({
  code: `city.${suffix}`,
  label,
  delta: suffix === 'match' ? 30 : 0,
});

/** Stationnement ou bien professionnel : pas un logement (§16). */
function nonResidentialExclusion(listing: AggregatedListing): ScoreReason | null {
  switch (listing.propertyType.value) {
    case 'parking':
      return { code: 'type.parking', label: 'Stationnement / box — pas un logement', delta: 0 };
    case 'commercial':
      return {
        code: 'type.commercial',
        label: 'Local, bureau ou licence — pas un logement',
        delta: 0,
      };
    default:
      return null;
  }
}

/**
 * Le loyer comparé, et d'où il sort. « 724 € charges comprises » quand il ne
 * s'agit pas du montant affiché : sans cette mention, la raison citait un
 * nombre introuvable sur l'annonce.
 */
function rentLabel(compared: number, published: number | null): string {
  return compared === published ? `${compared} €` : `${compared} € charges comprises`;
}

export function scoreMatch(listing: AggregatedListing, criteria: SearchCriteria): MatchOutcome {
  const reasons: ScoreReason[] = [];
  const unknownSignals: string[] = [];
  let matchesCriteria = true;
  let total = 0;
  let maxTotal = 0;
  // Poids des dimensions dont la valeur est inconnue, retirés du dénominateur.
  let unknownWeight = 0;

  // --- Ville : critère éliminatoire ----------------------------------------
  maxTotal += 30;
  const cityOutcome = evaluateCity(listing, criteria);
  total += cityOutcome.points;
  if (!cityOutcome.matches) matchesCriteria = false;
  if (cityOutcome.unknown) {
    unknownSignals.push('ville');
    unknownWeight += 30;
  }
  reasons.push(cityOutcome.reason);

  // --- Loyer : critère éliminatoire ----------------------------------------
  //
  // LE BUDGET SE COMPTE CHARGES COMPRISES (voir `SearchCriteria.maxPrice`) : un
  // logement affiché « 566 € + 158 € de charges » se loue 724 € et dépasse un
  // budget de 700 €. Le plancher, lui, reste sur le montant publié — il sert à
  // reconnaître un parking, pas à juger un total.
  maxTotal += 40;
  const published = listing.price.value;
  const price = rentForBudget({
    price: published,
    charges: listing.charges.value,
    chargesIncluded: listing.chargesIncluded,
  });
  if (price === null) {
    unknownSignals.push('loyer');
    unknownWeight += 40;
    reasons.push({ code: 'price.unknown', label: 'Loyer non publié', delta: 0 });
  } else if (
    criteria.minPrice !== undefined &&
    published !== null &&
    published < criteria.minPrice
  ) {
    // Sous ce plancher, ce n'est presque jamais un logement (parking/box/cave
    // mal étiqueté « appartement »). Éliminatoire, mais l'annonce reste
    // consultable en « hors critères ».
    matchesCriteria = false;
    reasons.push({
      code: 'price.under_floor',
      label: `${published} € sous le plancher de ${criteria.minPrice} € (probable parking/box)`,
      delta: 0,
    });
  } else if (price <= criteria.maxPrice) {
    // Plus le loyer est bas sous le plafond, meilleur est le score : à 30 % du
    // budget sous le plafond, on atteint le maximum.
    const margin = (criteria.maxPrice - price) / criteria.maxPrice;
    const points = Math.round(30 + Math.min(10, margin * 33));
    total += points;
    reasons.push({
      code: 'price.within',
      label: `${rentLabel(price, published)} ≤ ${criteria.maxPrice} € de budget`,
      delta: points,
    });
  } else {
    matchesCriteria = false;
    reasons.push({
      code: 'price.over',
      label: `${rentLabel(price, published)} dépasse le budget de ${price - criteria.maxPrice} €`,
      delta: 0,
    });
  }

  // --- Surface : critère éliminatoire --------------------------------------
  maxTotal += 30;
  const area = listing.area.value;
  if (area === null) {
    unknownSignals.push('surface');
    unknownWeight += 30;
    reasons.push({ code: 'area.unknown', label: 'Surface non publiée', delta: 0 });
  } else if (area >= criteria.minArea) {
    // Au-delà du minimum, chaque m² compte de moins en moins.
    const bonus = Math.min(10, (area - criteria.minArea) / 2);
    const points = Math.round(20 + bonus);
    total += points;
    reasons.push({
      code: 'area.within',
      label: `${area} m² ≥ ${criteria.minArea} m²`,
      delta: points,
    });
  } else {
    matchesCriteria = false;
    reasons.push({
      code: 'area.under',
      label: `${area} m² sous le minimum de ${criteria.minArea} m²`,
      delta: 0,
    });
  }

  // --- Filtres binaires éliminatoires (§16, §17) ----------------------------
  // Chacun rend une raison d'exclusion ou `null`. Ce sont des filtres binaires
  // (dedans/dehors), pas des dimensions notées : ils n'entrent ni dans `total`
  // ni dans `maxTotal`, et un signal INCONNU n'élimine jamais (§17). L'annonce
  // reste collectée et consultable hors critères (§53).
  /**
   * SEUL LE NON-RÉSIDENTIEL RESTE ÉLIMINATOIRE ICI.
   *
   * Colocation, bail étudiant, nature du bailleur et ameublement étaient jugés
   * au même endroit — et FIGÉS dans `matches_criteria`. Les cocher marchait ;
   * les décocher ne ramenait rien, puisque les annonces écartées à la collecte
   * restaient marquées « hors critères » et qu'aucun filtre ne les repêchait.
   *
   * Ce sont des PRÉFÉRENCES, pas des faits sur le bien : elles s'appliquent
   * désormais à la lecture (`core/trait-filters`), où les changer se voit
   * immédiatement, dans les deux sens. Un parking, lui, ne devient pas un
   * logement parce qu'on change d'avis.
   */
  const exclusion = nonResidentialExclusion(listing);
  if (exclusion !== null) {
    matchesCriteria = false;
    reasons.push(exclusion);
  }

  // --- Critères optionnels, inactifs dans le MVP (§2) -----------------------
  if (criteria.propertyTypes !== undefined && criteria.propertyTypes.length > 0) {
    maxTotal += 10;
    const type = listing.propertyType.value;
    if (criteria.propertyTypes.includes(type)) {
      total += 10;
      reasons.push({ code: 'type.match', label: `Type recherché (${type})`, delta: 10 });
    } else if (type === 'unknown') {
      unknownSignals.push('type de bien');
      unknownWeight += 10;
    }
  }

  if (criteria.furnished !== undefined) {
    maxTotal += 10;
    const furnished = listing.furnished.value;
    if (furnished === null) {
      unknownSignals.push('meublé');
      unknownWeight += 10;
    } else if (furnished === criteria.furnished) {
      total += 10;
      reasons.push({
        code: 'furnished.match',
        label: criteria.furnished ? 'Meublé, comme demandé' : 'Non meublé, comme demandé',
        delta: 10,
      });
    }
  }

  // Le score est rapporté au total réellement évaluable : une annonce dont la
  // surface est inconnue n'est pas pénalisée comme si elle était trop petite.
  // On retire le poids réel de chaque dimension inconnue (30 ou 40), pas 10.
  const evaluated = maxTotal - unknownWeight;
  const normalized = evaluated > 0 ? (total / evaluated) * 100 : 0;

  return {
    matchesCriteria,
    score: {
      value: clampScore(matchesCriteria ? normalized : Math.min(normalized, 40)),
      reasons,
      unknownSignals,
      confidence: maxTotal > 0 ? Math.max(0, evaluated / maxTotal) : 0,
    },
  };
}
