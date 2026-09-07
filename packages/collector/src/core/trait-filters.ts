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
 * Les colonnes visées sont celles de `listings`, sans préfixe de table : les
 * deux requêtes qui s'en servent lisent `listings` directement.
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
    sql.push('(commute_minutes IS NULL OR commute_minutes <= ?)');
    args.push(filters.maxCommuteMinutes);
  }

  return { sql, args };
}
