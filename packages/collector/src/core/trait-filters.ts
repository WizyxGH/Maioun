/**
 * Les préférences qui s'appliquent À LA LECTURE : colocation, bail étudiant,
 * nature du bailleur, ameublement (§16, §66).
 *
 * POURQUOI ELLES NE SONT PLUS DES CRITÈRES DE COLLECTE. Elles l'étaient :
 * évaluées une fois, au moment où l'annonce entrait en base, et figées dans
 * `matches_criteria`. Les COCHER marchait — la liste rétrécissait, puisque la
 * colonne et le filtre disaient la même chose. Les DÉCOCHER ne ramenait rien :
 * les annonces écartées à la collecte restaient marquées « hors critères », et
 * aucun filtre ne les repêchait. Un demi-interrupteur, qui n'allume pas.
 *
 * Elles vivent donc ici, et nulle part ailleurs. `matches_criteria` ne juge plus
 * que ce qui est INTRINSÈQUE à l'annonce — commune, loyer, surface, trajet, bien
 * non résidentiel : des faits qu'aucun réglage ne change.
 *
 * DEUX ENDROITS LES APPLIQUENT, et c'est pourquoi ce fichier existe plutôt que
 * deux copies (§75) :
 *
 *   - la LISTE, pour ce qu'on affiche ;
 *   - les NOTIFICATIONS, pour ce qu'on signale. Les oublier là aurait envoyé
 *     des alertes pour des colocations que l'écran n'affiche pas — le pire des
 *     deux mondes.
 *
 * UN TRAIT INCONNU N'ÉCARTE JAMAIS RIEN (§17). C'est la règle de chaque ligne
 * ci-dessous : « exclure les colocations » écarte ce qui EST une colocation,
 * pas ce dont on ignore si c'en est une. La plupart des annonces ne disent rien
 * de leur ameublement ni de leur bailleur ; les traiter comme des « non »
 * viderait la liste sur une information que les sources ne donnent pas.
 */

/** Les quatre préférences, telles qu'elles sont enregistrées. */
export interface TraitFilters {
  readonly excludeFlatShare?: boolean;
  readonly excludeStudent?: boolean;
  readonly landlordFilter?: 'all' | 'private' | 'agency';
  readonly furnishedFilter?: 'all' | 'furnished' | 'unfurnished';
  readonly maxCommuteMinutes?: number;
  /**
   * Date d'emmenagement souhaitee, au format `AAAA-MM-JJ`. Ne garde que les
   * logements disponibles AU PLUS TARD ce jour-la.
   */
  readonly availableBy?: string;
  /**
   * Quartiers retenus, par leur slug canonique. Vide ou absent = toute la
   * commune.
   */
  readonly districts?: readonly string[];
  /**
   * Garder les annonces dont le quartier est INCONNU quand des quartiers sont
   * nommés. Absent = oui. Voir la règle du quartier plus bas.
   */
  readonly includeUnknownDistrict?: boolean;
}

export interface TraitConditions {
  /** Conditions SQL à joindre par `AND`. */
  readonly sql: readonly string[];
  /** Valeurs des `?`, dans l'ordre des conditions. */
  readonly args: readonly (string | number)[];
}

/**
 * Traduit les préférences en conditions SQL.
 *
 * LES COLONNES SANS PRÉFIXE SONT CELLES DE `listings` — colocation, bail
 * étudiant, ameublement, bailleur, quartier, disponibilité : ce sont des faits
 * sur le logement, communs à tous.
 *
 * `sc.` DÉSIGNE LE SCORE DU COMPTE (`listing_user_score`), et une seule
 * colonne en relève : le TRAJET. Il dépend des points de référence de chacun —
 * le domicile et le travail ne sont pas les mêmes d'un compte à l'autre — donc
 * il ne peut pas vivre sur la fiche. Les deux requêtes qui appellent cette
 * fonction doivent joindre cette table sous cet alias.
 */
export function traitConditions(filters: TraitFilters): TraitConditions {
  const sql: string[] = [];
  const args: (string | number)[] = [];

  if (filters.excludeFlatShare === true) sql.push('COALESCE(flat_share, 0) = 0');
  if (filters.excludeStudent === true) sql.push('COALESCE(student_only, 0) = 0');

  // « Particuliers seuls » GARDE LES INCONNUS : beaucoup d'annonces de
  // particuliers ne se déclarent pas comme telles, et les écarter reviendrait à
  // n'afficher que le vide. « Agences uniquement », à l'inverse, demande une
  // agence AVÉRÉE — c'est le sens même de la demande.
  if (filters.landlordFilter === 'private') sql.push("COALESCE(landlord_kind, '') != 'agency'");
  if (filters.landlordFilter === 'agency') sql.push("landlord_kind = 'agency'");

  if (filters.furnishedFilter === 'furnished') sql.push('COALESCE(furnished, 1) = 1');
  if (filters.furnishedFilter === 'unfurnished') sql.push('COALESCE(furnished, 0) = 0');

  // Le trajet manque pour toute annonce sans adresse publiée — la majorité.
  // Les écarter reviendrait à masquer la liste entière dès qu'on règle un
  // plafond, ce que personne n'attend d'un curseur de durée.
  if (typeof filters.maxCommuteMinutes === 'number') {
    sql.push('(sc.commute_minutes IS NULL OR sc.commute_minutes <= ?)');
    args.push(filters.maxCommuteMinutes);
  }

  // LA DISPONIBILITE INCONNUE NE DISQUALIFIE PAS, comme partout ailleurs ici :
  // deux annonces sur trois ne publient aucune date, et les ecarter viderait la
  // liste des deux tiers des la premiere date saisie. Ce qu'on retire, ce sont
  // les logements dont on SAIT qu'ils ne seront pas libres a temps.
  //
  // La comparaison est textuelle, et elle peut l'etre : les dates sont rangees
  // en ISO 8601, ou l'ordre alphabetique EST l'ordre chronologique. Le `T23:59`
  // fait de la borne une fin de journee — sans lui, une annonce disponible le
  // jour meme, rangee a `T00:00:00.000Z`, passerait de justesse mais une autre
  // horodatee dans l'apres-midi serait rejetee le meme jour.
  if (typeof filters.availableBy === 'string' && filters.availableBy !== '') {
    sql.push('(available_at IS NULL OR available_at <= ?)');
    args.push(`${filters.availableBy}T23:59:59.999Z`);
  }

  /**
   * LE QUARTIER EST LE SEUL FILTRE QUI PEUT ÉCARTER LES INCONNUS — si on le
   * demande. Par défaut il les garde, comme tous les autres ; décocher
   * « inclure les annonces sans quartier connu » rétablit la règle ci-dessous.
   *
   * Partout ailleurs ici, une donnée absente ne disqualifie pas : « exclure les
   * colocations » écarte ce qui EST une colocation, pas ce dont on ignore si
   * c'en est une. La règle s'inverse quand on NOMME des quartiers, parce que la
   * demande n'est plus une exclusion mais une liste blanche : « je veux
   * Riquier » ne veut pas dire « Riquier et tout ce dont je ne sais rien ».
   *
   * La moitié des annonces ne nomment aucun quartier. Les garder rendrait le
   * filtre décoratif — on cocherait, la liste ne bougerait presque pas, et
   * l'on ne saurait pas pourquoi. L'écran le dit franchement.
   */
  if (filters.districts !== undefined && filters.districts.length > 0) {
    const liste = `district IN (${filters.districts.map(() => '?').join(',')})`;
    /**
     * … SAUF SI L'ON DEMANDE DE GARDER LES INCONNUS, et c'est le défaut.
     *
     * La liste blanche stricte a montré son coût le 2026-09-10 : vingt-quatre
     * quartiers cochés — presque toute la ville — et 125 annonces sur 193
     * masquées, parce que leur quartier est inconnu. Les digests des portails
     * n'en portent JAMAIS : tout Leboncoin, SeLoger et Bien'ici disparaissait
     * de la liste, et les notifications se sont tues. Cocher vingt-quatre
     * quartiers voulait dire « pas les autres », pas « rien de ce qui ne dit
     * pas où il est ».
     *
     * L'interrupteur laisse choisir. Décoché, on retrouve la règle stricte.
     */
    sql.push(filters.includeUnknownDistrict === false ? liste : `(district IS NULL OR ${liste})`);
    args.push(...filters.districts);
  }

  return { sql, args };
}
