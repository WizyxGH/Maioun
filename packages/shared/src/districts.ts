/**
 * Les quartiers de Nice, une bonne fois (§17).
 *
 * POURQUOI UNE TABLE, ET POURQUOI ICI. Les sources écrivent le quartier comme
 * elles veulent : relevé en base le 2026-09-07, cent une valeurs distinctes
 * pour une quarantaine de lieux réels — « Vieux Nice » et « Vieux-Nice »,
 * « Liberation » et « Libération », « PORT » et « Le Port », « Mont Boron »,
 * « Mont-Boron » et « - MONT BORON ». On ne peut pas proposer cela dans un
 * menu, et encore moins filtrer dessus : cocher « Le Port » raterait trente et
 * une annonces rangées sous « PORT ».
 *
 * La table vit dans `shared` parce que TROIS étages en dépendent et doivent
 * dire la même chose : la normalisation, qui range chaque annonce sous son
 * quartier ; l'API, qui filtre ; l'écran, qui affiche le menu. Trois copies
 * auraient divergé (§75).
 *
 * L'ORDRE EST SIGNIFIANT : le premier nom reconnu l'emporte, donc le plus
 * précis vient d'abord. « Nice Ouest Madeleine » doit donner Madeleine, le
 * quartier, et non Nice Ouest, le secteur qui en contient une demi-douzaine ;
 * « Bas Fabron » doit l'emporter sur « Fabron ».
 *
 * LA LISTE EST FERMÉE, ET C'EST LE POINT. « À la madeleine » ne se distingue
 * d'un lieu-dit quelconque que si l'on SAIT que c'est un quartier de Nice. Ce
 * qui n'y figure pas reste sans quartier — la bonne réponse quand on ne sait
 * pas (§17) —, et les communes voisines qui traînent dans les données (« Cros
 * de Cagnes », « La Bocca », « Croisette ») sont écartées pour la même raison :
 * ce ne sont pas des quartiers de Nice.
 */

/** Un quartier : son identifiant stable, son nom affiché, ses graphies. */
export interface District {
  /** Identifiant stable, employé en base et dans les URL. */
  readonly slug: string;
  /** Nom montré à l'utilisateur. */
  readonly label: string;
  /**
   * Graphies supplémentaires rencontrées dans les sources, en plus du `label`.
   * Comparées sans casse ni accent, sur des mots entiers.
   */
  readonly aliases?: readonly string[];
}

export const NICE_DISTRICTS: readonly District[] = [
  // --- Noms composés d'abord : ils contiennent les simples ----------------
  { slug: 'vieux-nice', label: 'Vieux Nice', aliases: ['vieille ville'] },
  { slug: 'petit-fabron', label: 'Petit Fabron' },
  { slug: 'bas-fabron', label: 'Bas Fabron' },
  { slug: 'mont-boron', label: 'Mont Boron' },
  { slug: 'bon-voyage', label: 'Bon Voyage' },
  { slug: 'las-planas', label: 'Las Planas' },
  {
    slug: 'saint-pierre-de-feric',
    label: 'Saint-Pierre-de-Féric',
    aliases: ['st pierre de feric'],
  },
  { slug: 'sainte-marguerite', label: 'Sainte-Marguerite' },
  { slug: 'saint-sylvestre', label: 'Saint-Sylvestre' },
  { slug: 'saint-pancrace', label: 'Saint-Pancrace' },
  { slug: 'saint-augustin', label: 'Saint-Augustin' },
  { slug: 'saint-philippe', label: 'Saint-Philippe' },
  { slug: 'saint-barthelemy', label: 'Saint-Barthélemy' },
  { slug: 'saint-maurice', label: 'Saint-Maurice' },
  { slug: 'saint-isidore', label: 'Saint-Isidore' },
  { slug: 'saint-antoine', label: 'Saint-Antoine' },
  { slug: 'saint-roch', label: 'Saint-Roch' },
  { slug: 'jean-medecin', label: 'Jean Médecin', aliases: ['medecin'] },
  { slug: 'corniche-fleurie', label: 'Corniche Fleurie' },
  { slug: 'parc-imperial', label: 'Parc Impérial' },
  { slug: 'rabiac-estagnol', label: 'Rabiac Estagnol', aliases: ['rabiac'] },
  { slug: 'val-fleuri', label: 'Val Fleuri' },
  { slug: 'la-victorine', label: 'La Victorine', aliases: ['victorine'] },
  { slug: 'le-ray', label: 'Le Ray' },
  { slug: 'roi-soleil', label: 'Roi Soleil' },
  { slug: 'albert-1er', label: 'Albert 1er', aliases: ['albert premier'] },

  // --- Noms simples --------------------------------------------------------
  { slug: 'borriglione', label: 'Borriglione' },
  { slug: 'liberation', label: 'Libération' },
  { slug: 'californie', label: 'Californie' },
  { slug: 'carabacel', label: 'Carabacel' },
  { slug: 'baumettes', label: 'Baumettes' },
  { slug: 'madeleine', label: 'Madeleine' },
  { slug: 'musiciens', label: 'Musiciens' },
  { slug: 'pessicart', label: 'Pessicart' },
  { slug: 'republique', label: 'République' },
  { slug: 'gambetta', label: 'Gambetta' },
  { slug: 'lanterne', label: 'Lanterne' },
  { slug: 'riquier', label: 'Riquier' },
  { slug: 'acropolis', label: 'Acropolis' },
  { slug: 'caucade', label: 'Caucade' },
  { slug: 'cessole', label: 'Cessole' },
  { slug: 'vernier', label: 'Vernier' },
  { slug: 'vauban', label: 'Vauban' },
  { slug: 'wilson', label: 'Wilson' },
  { slug: 'trachel', label: 'Trachel' },
  { slug: 'ferber', label: 'Ferber' },
  { slug: 'fabron', label: 'Fabron' },
  { slug: 'gairaut', label: 'Gairaut' },
  { slug: 'pasteur', label: 'Pasteur' },
  { slug: 'magnan', label: 'Magnan' },
  { slug: 'ariane', label: 'Ariane' },
  { slug: 'cimiez', label: 'Cimiez' },
  { slug: 'rimiez', label: 'Rimiez' },
  { slug: 'carras', label: 'Carras' },
  { slug: 'thiers', label: 'Thiers' },
  { slug: 'lenval', label: 'Lenval' },
  { slug: 'arson', label: 'Arson' },
  { slug: 'fleurs', label: 'Fleurs' },
  { slug: 'vinaigrier', label: 'Vinaigrier' },
  { slug: 'port', label: 'Le Port', aliases: ['port'] },

  /**
   * LE CENTRE EST UN LIBELLÉ LARGE, et il vient donc après tous les noms
   * précis : « CENTRE LES MUSICIENS » désigne les Musiciens, pas « le
   * centre ». Placé plus haut, il aurait avalé seize annonces bien rangées.
   */
  {
    slug: 'centre-ville',
    label: 'Centre-ville',
    aliases: ['centre', 'hyper centre', 'carre d or'],
  },

  // --- Secteurs : en dernier recours, faute de quartier plus précis --------
  { slug: 'nice-nord', label: 'Nice Nord' },
  { slug: 'nice-ouest', label: 'Nice Ouest' },
  { slug: 'nice-est', label: 'Nice Est' },
];

/** Le quartier portant ce `slug`, s'il existe. */
export function districtBySlug(slug: string): District | undefined {
  return NICE_DISTRICTS.find((district) => district.slug === slug);
}

/** Le nom à afficher pour un `slug`, ou le `slug` lui-même s'il est inconnu. */
export function districtLabel(slug: string): string {
  return districtBySlug(slug)?.label ?? slug;
}

/**
 * Forme comparable : minuscules, sans accent, sans ponctuation.
 *
 * Recopiée ici plutôt qu'importée de la normalisation du collecteur : ce
 * paquet est partagé avec le NAVIGATEUR, et n'a aucune raison de dépendre du
 * collecteur pour six lignes.
 */
function comparable(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les graphies d'un quartier : son nom, plus ses alias. */
function spellingsOf(district: District): readonly string[] {
  return [district.label, ...(district.aliases ?? [])].map(comparable);
}

/**
 * Le quartier de Nice nommé dans un texte, ou `null`.
 *
 * SUR DES MOTS ENTIERS : « Port » ne doit se déclencher ni sur « aéroport », ni
 * sur « portes ». C'est ce qui permet d'accepter des noms courts sans récolter
 * n'importe quoi.
 *
 * Le texte peut être un champ « quartier » brut (« OUEST MADELEINE »,
 * « - MONT BORON », « Gambetta - Fleurs ») aussi bien qu'un titre d'annonce :
 * dans les deux cas on cherche un nom CONNU, et le plus précis gagne.
 */
export function canonicalDistrict(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const haystack = comparable(text);
  if (haystack === '') return null;

  for (const district of NICE_DISTRICTS) {
    for (const spelling of spellingsOf(district)) {
      const pattern = new RegExp(`\\b${spelling.replace(/ /g, '\\s+')}\\b`);
      if (pattern.test(haystack)) return district.slug;
    }
  }
  return null;
}
