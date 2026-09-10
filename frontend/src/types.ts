/**
 * Types de l'interface.
 *
 * Ils décrivent exactement ce que l'API renvoie. Les champs fusionnés
 * conservent leur provenance et leurs conflits, afin que l'interface puisse
 * signaler « SeLoger annonce 690 €, Bien'ici annonce 715 € » plutôt que de
 * masquer le désaccord (§15).
 */

import type {
  Contact,
  ListingScores,
  MergedField,
  PropertyType,
  ReferenceDistance,
  ReferenceTravelMode,
  TenancyRequirements,
  TrackingStatus,
} from '@maioun/shared';

export type {
  TrackingStatus,
  ListingScores,
  ReferenceDistance,
  Contact,
  MergedField,
  PropertyType,
};

/** Occurrence telle que l'API la résume : de quoi ouvrir l'annonce d'origine (§38). */
export interface OccurrenceView {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly price: number | null;
  readonly area: number | null;
  readonly lastSeenAt: string;
}

/** Une fiche de logement, telle qu'affichée. */
export interface ListingView {
  readonly id: string;
  readonly title: MergedField<string | null>;
  readonly description: MergedField<string | null>;
  readonly price: MergedField<number | null>;
  readonly charges: MergedField<number | null>;
  readonly area: MergedField<number | null>;
  readonly rooms: MergedField<number | null>;
  readonly propertyType: MergedField<PropertyType>;
  readonly furnished: MergedField<boolean | null>;
  /** Colocation — absent sur les fiches écrites avant l'ajout du champ. */
  readonly flatShare?: MergedField<boolean | null>;
  /** Classe énergétique (DPE) — absent sur les fiches anciennes. */
  readonly dpe?: MergedField<string | null>;
  /**
   * Nombre maximal d'occupants annoncé — absent sur les fiches anciennes.
   * Décisif quand on cherche à plusieurs, et publié par les meublés.
   */
  readonly maxOccupants?: MergedField<number | null>;
  /** Atouts affichables (« Ascenseur », « Balcon »…) — absent sur les fiches anciennes. */
  readonly features?: readonly string[];
  /**
   * Les conditions d'accès énoncées par l'annonce — absent sur les fiches
   * collectées avant leur lecture.
   *
   * ELLES ARRIVENT JUSQU'À LA LISTE, contrairement à la description dont elles
   * sont tirées : c'est un objet de quatre champs, et c'est ce qui permet de
   * marquer une carte sans recharger la fiche.
   */
  readonly requirements?: TenancyRequirements;
  readonly address: MergedField<string | null>;
  /** Quartier/secteur si publié (ex. Orpi « Madeleine ») — situe mieux que la ville. */
  readonly district: MergedField<string | null>;
  readonly city: MergedField<string | null>;
  readonly postalCode: MergedField<string | null>;
  /** Coordonnées (source ou géocodage) — absentes si non localisable. */
  readonly latitude?: MergedField<number | null>;
  readonly longitude?: MergedField<number | null>;
  readonly publishedAt: MergedField<string | null>;
  readonly availableAt: MergedField<string | null>;
  readonly views: MergedField<number | null>;
  readonly favorites: MergedField<number | null>;
  readonly contact: Contact;
  readonly imageUrls: readonly string[];
  readonly scores: ListingScores;
  readonly distances: readonly ReferenceDistance[];
  readonly occurrences: readonly OccurrenceView[];
  readonly matchesCriteria: boolean;
  /** `true` si le loyer a récemment baissé (§17) — mis en avant dans l'UI. */
  readonly priceDropped?: boolean;
  /** `true` dès que la fiche a été ouverte au moins une fois (posé automatiquement). */
  readonly viewed?: boolean;
  /** `true` si l'utilisateur a archivé l'annonce (retirée de la liste par défaut). */
  readonly archived?: boolean;
  /** `true` si l'utilisateur a mis l'annonce en favori. */
  readonly favorite?: boolean;
  /** `true` si la source affiche le bien comme DÉJÀ LOUÉ (§32, §33). */
  readonly rented?: boolean;
  readonly actionPriority: number;
  readonly tracking: TrackingStatus;
  readonly lifecycle: 'active' | 'possiblyInactive' | 'inactive';
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  /**
   * Date de la PREMIÈRE alerte, si l'annonce en a fait l'objet. Absente pour
   * celles notifiées avant que l'horodatage n'existe : la date est inconnue et
   * ne s'invente pas (§17).
   */
  readonly notifiedAt?: string | null;
  /** Date de l'alerte « ce favori a disparu », le cas échéant. */
  readonly goneNotifiedAt?: string | null;
  /** Date du rappel « vous n'avez pas encore candidaté », le cas échéant. */
  readonly remindedAt?: string | null;
  /**
   * `true` si la fiche vient de la LISTE, donc allégée : sans description ni
   * détail des scores, retirés en SQL parce qu'ils pèsent les quatre
   * cinquièmes de la charge utile et que la liste n'en affiche aucun.
   *
   * L'écran de fiche doit alors demander la version complète. Sans ce drapeau
   * il ne pouvait pas faire la différence, affichait une description absente,
   * et faisait tomber tout le rendu.
   */
  readonly partial?: boolean;
}

export interface ListingsResponse {
  readonly listings: readonly ListingView[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** État d'une source, pour la page d'observabilité (§63). */
export interface SourceStateView {
  readonly sourceId: string;
  readonly health: 'healthy' | 'degraded' | 'cooldown' | 'disabled' | 'blocked';
  readonly lastRunAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly last429At: string | null;
  readonly cooldownUntil: string | null;
  readonly consecutiveErrors: number;
  readonly averageNewListingCount: number;
}

export type SortMode = 'priority' | 'recent' | 'price' | 'closest' | 'area';

/** Un point de l'historique de l'inventaire (§33). */
export interface DailyStat {
  readonly day: string;
  readonly matching: number;
  readonly uncertain: number;
  readonly rented: number;
  readonly total: number;
  readonly activeSources: number;
}

/** Statistiques de suivi (§33). */
/**
 * Durée de vie des annonces, mesurée sur l'inventaire (§31).
 *
 * `medianDays` vaut `null` tant que la moitié des annonces observées ne s'est
 * pas éteinte : la médiane est alors au-delà de ce qu'on a vu, et l'afficher
 * serait l'inventer (§17). `censored` compte celles encore en ligne, qui
 * pèsent dans la mesure sans compter comme des disparitions.
 */
export interface SurvivalData {
  readonly medianDays: number | null;
  readonly completed: number;
  readonly censored: number;
  readonly horizonDays: number;
  readonly aliveAfter: readonly { readonly day: number; readonly share: number | null }[];
}

export interface StatsData {
  /** Évolution jour par jour — absente des API anciennes. */
  readonly history?: readonly DailyStat[];
  /** Absente des API anciennes, comme `history`. */
  readonly survival?: SurvivalData;
  readonly listings: {
    readonly total: number;
    /** Annonces dans les critères et ENCORE ACTIVES : le vrai gisement. */
    readonly matching: number;
    /**
     * Dans les critères mais disparues de leur source depuis plusieurs
     * collectes — affichées et consultables, mais à vérifier (§33).
     */
    readonly uncertain?: number;
    readonly active: number;
    readonly viewed: number;
    readonly archived: number;
    /** Biens dans les critères repérés comme LOUÉS (§33). */
    readonly rented?: number;
  };
  readonly byTracking: Readonly<Record<string, number>>;
  readonly bySource: Readonly<Record<string, number>>;
  readonly contacts: {
    readonly total: number;
    readonly byOutcome: Readonly<Record<string, number>>;
  };
}

/** Filtres de recherche éditables depuis l'interface (§66). */
export interface FilterConfig {
  cities: string[];
  maxPrice: number;
  minPrice?: number;
  minArea: number;
  /**
   * Durée maximale du trajet domicile→travail, en minutes (§20).
   *
   * EXPRIMÉE DANS LE MODE DU POINT DE REPÈRE, qui est celui où la collecte a
   * calculé les durées. `commuteMode` ne dit que dans quel mode on la SAISIT :
   * la conversion se fait à l’affichage, pour que le serveur continue de
   * comparer des minutes comparables.
   */
  maxCommuteMinutes?: number;
  /**
   * Mode de déplacement dans lequel la durée ci-dessus est saisie et relue.
   *
   * IL FALLAIT OUVRIR L’ÉCRAN DES POINTS DE REPÈRE pour le changer, alors que
   * c’est un critère de recherche comme un autre : trente minutes à pied et
   * trente minutes en voiture ne désignent pas la même ville.
   */
  commuteMode?: ReferenceTravelMode;
  excludeFlatShare?: boolean;
  excludeStudent?: boolean;
  /** Nature du bailleur : tous, particuliers (hors agences), ou agences. */
  landlordFilter?: 'all' | 'private' | 'agency';
  /** Meublé : tous, meublés seulement, ou non meublés seulement. */
  furnishedFilter?: 'all' | 'furnished' | 'unfurnished';
  /**
   * Date d'emménagement souhaitée (`AAAA-MM-JJ`), telle que la rend un champ
   * `<input type="date">`. Vide = aucune contrainte de disponibilité.
   */
  availableBy?: string;
  /**
   * Quartiers retenus, par leur slug canonique. Vide = toute la commune.
   *
   * SEUL FILTRE QUI ÉCARTE LES ANNONCES SANS QUARTIER : nommer des quartiers
   * est une liste blanche, pas une exclusion.
   */
  districts?: string[];
}
