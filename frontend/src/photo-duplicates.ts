/**
 * LA MÊME PHOTO, DEUX FOIS, DONT UNE FLOUE.
 *
 * Signalé par l'utilisateur : « parfois la première image du carrousel est la
 * même que la deuxième, mais en flou ». Relevé du 2026-09-18 : 138 fiches
 * actives sur 3 072 publient un même cliché sous deux adresses. La plateforme
 * La Boîte Immo sert `/1600xauto/…` ET `/original/…` du même fichier ;
 * Laforêt publie une découpe de 400 × 250 chez un hébergeur et l'image
 * entière chez un autre. Affichée pleine largeur, la petite est floue.
 *
 * POURQUOI PAS LA RÈGLE DU DÉDOUBLONNAGE. Le collecteur a déjà une identité de
 * cliché (`photoName`), mais elle répond à une AUTRE question : reconnaître le
 * même fichier d'une annonce à l'autre, dans tout l'inventaire. Elle exige donc
 * un nom long et chiffré, parce que `1.jpg` est porté par quatre-vingt-dix-huit
 * annonces d'un même portail. Ici on compare une dizaine de clichés d'UNE
 * fiche : le risque n'est pas le même, et le nom découpé de Laforêt — neuf
 * caractères — passerait à travers la règle stricte alors qu'il désigne bien
 * deux fois la même photo.
 *
 * LE GARDE-FOU TIENT À L'HÔTE. Deux sources fusionnées dans une même fiche
 * peuvent chacune avoir leur `1.jpg`, et ce ne sont pas les mêmes photos. Un
 * nom court ne rapproche donc que deux adresses du même hôte.
 */

/** En deçà, un nom ne distingue rien entre deux hébergeurs différents. */
const NOM_DISTINCTIF = 8;

/** Ce qui n'est qu'une taille dans une adresse, et non l'identité du cliché. */
const TAILLE =
  /[-_/](?:\d{2,4}x(?:\d{2,4}|auto)|thumb|thumbnail|small|medium|large|mini|preview|vignette|scaled|original)(?=[-_/.]|$)/gi;

interface Cliche {
  readonly hote: string;
  readonly nom: string;
}

/** L'hôte et le nom de fichier d'une adresse, ou `null` si elle est illisible. */
function cliche(url: string): Cliche | null {
  try {
    const parsed = new URL(url, 'https://exemple.invalid');
    const path = parsed.pathname;
    const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    const nom = base.replace(/\.[a-z0-9]{2,5}$/, '').replace(TAILLE, '');
    return nom === '' ? null : { hote: parsed.hostname.toLowerCase(), nom };
  } catch {
    return null;
  }
}

/** La largeur que l'adresse déclare, `0` si elle n'en déclare aucune. */
function largeurDeclaree(url: string): number {
  const dansLeChemin = /(?:^|[-_/])(\d{3,4})x(?:\d{2,4}|auto)(?=[-_/.]|$)/i.exec(url);
  if (dansLeChemin?.[1] !== undefined) return Number(dansLeChemin[1]);
  const dansLaRequete = /[?&](?:w|width)=(\d{2,4})\b/i.exec(url);
  return dansLaRequete?.[1] === undefined ? 0 : Number(dansLaRequete[1]);
}

/**
 * Laquelle des deux adresses sert la meilleure image ?
 *
 * « Originale » d'abord — c'est le mot que la plateforme emploie —, puis la
 * plus large. Une adresse qui ne déclare AUCUNE taille l'emporte sur une
 * découpe chiffrée : ne rien dire, c'est servir l'image entière, alors que
 * `w=400` est une réduction explicite.
 */
function meilleure(a: string, b: string): string {
  const originale = (url: string): boolean => /(?:^|[-_/])original(?=[-_/.]|$)/i.test(url);
  if (originale(a) !== originale(b)) return originale(a) ? a : b;
  const [la, lb] = [largeurDeclaree(a), largeurDeclaree(b)];
  if (la === 0 || lb === 0) return la === 0 ? a : b;
  return la >= lb ? a : b;
}

/**
 * Le même cliché ne paraît qu'une fois, dans sa meilleure définition.
 *
 * L'ORDRE EST CELUI DE LA SOURCE : le doublon prend la place de sa première
 * apparition, avec la meilleure des deux adresses. Remonter la grande image à
 * la place de la petite changerait l'ordre des photos sans raison visible.
 */
export function uniquePhotos(urls: readonly string[]): readonly string[] {
  const retenues: string[] = [];
  const positions = new Map<string, number>();
  for (const url of urls) {
    const identite = cliche(url);
    if (identite === null) {
      retenues.push(url);
      continue;
    }
    // Un nom court ne vaut que chez le même hébergeur ; un nom distinctif se
    // reconnaît d'un hôte à l'autre, et c'est le cas des découpes de portail.
    const cle =
      identite.nom.length >= NOM_DISTINCTIF && /\d/.test(identite.nom)
        ? identite.nom
        : `${identite.hote}|${identite.nom}`;
    const vue = positions.get(cle);
    if (vue === undefined) {
      positions.set(cle, retenues.length);
      retenues.push(url);
      continue;
    }
    retenues[vue] = meilleure(retenues[vue] ?? url, url);
  }
  return retenues;
}
