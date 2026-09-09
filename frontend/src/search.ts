/**
 * Recherche libre dans la liste des annonces (§36).
 *
 * Cherche dans ce qui identifie un logement pour un humain : le titre, la
 * commune, le quartier, la rue, la description et le nom de l'agence. Chaque
 * mot saisi doit se retrouver quelque part (ET implicite), pour que
 * « nice gambetta » restreigne au lieu d'élargir.
 *
 * La comparaison ignore casse et accents : « libération » trouve « LIBERATION »,
 * fréquent dans les annonces écrites en capitales.
 */

/** Un champ fusionné, tel que l API le rend — ou rien du tout. */
type Field = { readonly value: string | null } | undefined;

/**
 * Champs d une annonce que la recherche inspecte.
 *
 * TOUS FACULTATIFS, ET CE N EST PAS DE LA PRUDENCE DÉCORATIVE. La LISTE ne
 * reçoit pas la fiche entière : le serveur en retire la description et les
 * raisons de score (`json_remove`), pour ne pas transporter des centaines de
 * kilo-octets que la liste n affiche pas. `listing.description.value` levait
 * donc une exception dès la première frappe dans la barre de recherche, et
 * l écran entier tombait sur « Cet écran n a pas pu s afficher ».
 *
 * La description n est donc PAS cherchée dans la liste — elle n y est pas. Le
 * reste suffit à retrouver une annonce : titre, commune, quartier, rue, code
 * postal et agence.
 */
export interface Searchable {
  readonly title?: Field;
  readonly description?: Field;
  readonly city?: Field;
  readonly district?: Field;
  readonly address?: Field;
  readonly postalCode?: Field;
  readonly contact?: { readonly agencyName: string | null } | undefined;
}

/** Minuscules sans accent, pour comparer « Libération » et « LIBERATION ». */
function comparable(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * `true` si l'annonce correspond à la recherche. Une recherche vide laisse tout
 * passer — elle ne doit jamais masquer d'annonce par inadvertance (§17).
 */
export function matchesSearch(listing: Searchable, query: string): boolean {
  const terms = comparable(query)
    .split(/\s+/)
    .filter((term) => term !== '');
  if (terms.length === 0) return true;

  const haystack = comparable(
    [
      listing.title?.value,
      listing.description?.value,
      listing.city?.value,
      listing.district?.value,
      listing.address?.value,
      listing.postalCode?.value,
      listing.contact?.agencyName,
    ]
      .filter((part): part is string => typeof part === 'string' && part !== '')
      .join(' '),
  );

  return terms.every((term) => haystack.includes(term));
}

/**
 * Ce que la barre de recherche propose pendant qu'on tape.
 *
 * ON NE PROPOSE QUE CE QUI EXISTE. Chaque suggestion est tirée des annonces
 * DÉJÀ CHARGÉES, avec le nombre qu'elle laisserait passer : aucune ne peut
 * donc mener à une liste vide, et le compte dit d'avance si l'effort en vaut
 * la peine. Une liste de quartiers en dur aurait proposé Cimiez un jour où
 * Cimiez n'a rien.
 *
 * QUATRE FAMILLES, dans l'ordre où elles servent : le quartier — c'est ainsi
 * qu'on cherche un logement —, la rue, l'agence, la commune.
 */
export type SuggestionKind = 'district' | 'street' | 'agency' | 'city';

export interface SearchSuggestion {
  /** Le texte qui remplacera la saisie. */
  readonly value: string;
  readonly kind: SuggestionKind;
  /** Nombre d'annonces chargées qui portent cette valeur. */
  readonly count: number;
}

/** Poids d'affichage : le quartier d'abord, la commune en dernier. */
const KIND_ORDER: Readonly<Record<SuggestionKind, number>> = {
  district: 0,
  street: 1,
  agency: 2,
  city: 3,
};

/**
 * La VOIE seule, sans son numéro.
 *
 * « 12 rue Barla » et « 48 rue Barla » sont deux adresses et une seule rue :
 * proposer les deux remplirait la liste de doublons pour qui cherche la rue.
 */
function streetName(address: string): string {
  return address.replace(/^\s*\d{1,4}(?:[-/]\d{1,3})?\s*(?:bis|ter)?[,]?\s*/i, '').trim();
}

/**
 * Les suggestions correspondant à `query`, les plus fournies d'abord.
 *
 * Une saisie vide ne propose RIEN : la barre est alors au repos, et dérouler
 * une liste sous le curseur au premier clic gênerait plus qu'elle n'aiderait.
 */
export function suggestSearch(
  listings: readonly Searchable[],
  query: string,
  limit = 6,
): readonly SearchSuggestion[] {
  const needle = comparable(query.trim());
  if (needle === '') return [];

  /** Clé de dédoublonnage : la forme comparable, pour ne pas lister deux casses. */
  const counts = new Map<string, { value: string; kind: SuggestionKind; count: number }>();
  const add = (raw: string | null | undefined, kind: SuggestionKind): void => {
    if (typeof raw !== 'string') return;
    const value = raw.trim();
    if (value === '') return;
    const key = `${kind}:${comparable(value)}`;
    const found = counts.get(key);
    if (found === undefined) counts.set(key, { value, kind, count: 1 });
    else found.count += 1;
  };

  for (const listing of listings) {
    add(listing.district?.value, 'district');
    const address = listing.address?.value;
    if (typeof address === 'string') add(streetName(address), 'street');
    add(listing.contact?.agencyName, 'agency');
    add(listing.city?.value, 'city');
  }

  return (
    [...counts.values()]
      // Le terme doit se trouver DANS la suggestion : « barla » propose « rue
      // Barla », « rue » ne propose pas les trois cents rues du fichier — il en
      // proposerait un échantillon arbitraire, ce qui ne guide personne.
      .filter((one) => comparable(one.value).includes(needle) && comparable(one.value) !== needle)
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          b.count - a.count ||
          a.value.localeCompare(b.value, 'fr'),
      )
      .slice(0, limit)
      .map(({ value, kind, count }) => ({ value, kind, count }))
  );
}
