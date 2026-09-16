/**
 * Les communes du périmètre, et le slug que chaque portail en attend.
 *
 * POURQUOI ICI. La liste des treize communes était RECOPIÉE dans trois sources
 * — Orpi, FNAIM, ParuVendu — chacune dans l'orthographe de son portail :
 * « st-laurent-du-var » chez l'une, « saint-laurent-du-var » chez l'autre, avec
 * ou sans code postal. Une commune ajoutée au périmètre aurait été oubliée dans
 * deux sources sur trois, sans que rien ne le signale : la source se serait
 * contentée de ne jamais la chercher.
 *
 * LA LISTE EST LA MÊME, L'ÉCRITURE NON. Les écarts entre portails sont des
 * RÈGLES, pas des listes : abréger « saint » en « st », coller le code postal.
 * Là où la règle ne suffit pas, une exception est nommée et justifiée à
 * l'endroit où le portail la réclame — trois lignes à relire plutôt qu'une
 * liste entière à comparer.
 *
 * LE CODE POSTAL EST UN FAIT DE LA COMMUNE, pas du portail : la FNAIM,
 * ParuVendu et Guy Hoquet écrivent tous les trois « cagnes-sur-mer-06800 ». Il
 * vit donc avec la commune, et chaque portail dit seulement s'il en veut un.
 */

/** Une commune du périmètre. */
export interface Commune {
  /** Slug canonique : minuscules, sans accent ni apostrophe, tirets. */
  readonly slug: string;
  /** Code postal principal, que certains portails collent au slug. */
  readonly postalCode: string;
}

/**
 * Les communes suivies : Nice et sa continuité urbaine.
 *
 * L'ORDRE EST CELUI DE LA COLLECTE, Nice d'abord. Si un budget venait à couper
 * un passage en cours, ce qui se perdrait serait le bout de la liste — les
 * petites communes, quelques annonces —, jamais l'essentiel.
 */
export const PERIMETER_COMMUNES: readonly Commune[] = [
  { slug: 'nice', postalCode: '06000' },
  { slug: 'saint-laurent-du-var', postalCode: '06700' },
  { slug: 'cagnes-sur-mer', postalCode: '06800' },
  { slug: 'villeneuve-loubet', postalCode: '06270' },
  { slug: 'beaulieu-sur-mer', postalCode: '06310' },
  { slug: 'cap-d-ail', postalCode: '06320' },
  { slug: 'villefranche-sur-mer', postalCode: '06230' },
  { slug: 'la-trinite', postalCode: '06340' },
  { slug: 'saint-andre-de-la-roche', postalCode: '06730' },
  // Drap partage le 06340 de La Trinité : deux communes, un seul bureau.
  { slug: 'drap', postalCode: '06340' },
  { slug: 'carros', postalCode: '06510' },
  { slug: 'contes', postalCode: '06390' },
  { slug: 'colomars', postalCode: '06670' },
];

/**
 * Les slugs canoniques du périmètre, dans l'ordre de collecte.
 *
 * C'est la forme qu'emploient les plateformes d'agences (Apimo, Hektor, Netty),
 * qui écrivent les communes comme nous.
 */
export const NICE_AREA_SLUGS: readonly string[] = PERIMETER_COMMUNES.map((commune) => commune.slug);

/** Ce qu'un portail attend comme écriture des communes. */
export interface CommuneSlugStyle {
  /** « saint » abrégé en « st », comme la FNAIM l'écrit. */
  readonly abbreviateSaint?: boolean;
  /** Code postal collé au nom : « cagnes-sur-mer-06800 ». */
  readonly withPostalCode?: boolean;
  /** Communes à ne pas demander ici, par slug canonique. */
  readonly omit?: readonly string[];
  /**
   * Ce que le portail écrit quand la règle ne le retrouve pas, par slug
   * canonique vers le NOM attendu — le code postal reste ajouté par la règle.
   * Chaque entrée porte la raison de son existence là où elle est déclarée.
   */
  readonly exceptions?: Readonly<Record<string, string>>;
}

/** Une commune du périmètre, écrite comme un portail l'attend. */
export interface PortalCommune {
  /** Le slug canonique, pour retrouver la commune dans le périmètre. */
  readonly commune: string;
  /** Le nom tel que le portail l'écrit, sans code postal. */
  readonly name: string;
  /** Ce que le portail attend dans l'URL : le nom, et son code postal s'il en veut. */
  readonly slug: string;
  readonly postalCode: string;
}

/** « saint-laurent-du-var » → « st-laurent-du-var ». */
function abbreviateSaint(slug: string): string {
  return slug.replace(/\bsaint\b/g, 'st').replace(/\bsainte\b/g, 'ste');
}

/**
 * Les communes du périmètre écrites comme ce portail les attend.
 *
 * Une exception l'emporte sur la règle ; le code postal s'ajoute après, de
 * sorte qu'une exception n'a jamais à le répéter.
 */
export function portalCommunes(style: CommuneSlugStyle = {}): readonly PortalCommune[] {
  const omit = new Set(style.omit ?? []);
  return PERIMETER_COMMUNES.filter((commune) => !omit.has(commune.slug)).map((commune) => {
    const name =
      style.exceptions?.[commune.slug] ??
      (style.abbreviateSaint === true ? abbreviateSaint(commune.slug) : commune.slug);
    return {
      commune: commune.slug,
      name,
      slug: style.withPostalCode === true ? `${name}-${commune.postalCode}` : name,
      postalCode: commune.postalCode,
    };
  });
}

/** Les seuls slugs, quand le reste ne sert pas. */
export function portalCommuneSlugs(style: CommuneSlugStyle = {}): readonly string[] {
  return portalCommunes(style).map((commune) => commune.slug);
}
