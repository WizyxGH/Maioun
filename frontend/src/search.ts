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
