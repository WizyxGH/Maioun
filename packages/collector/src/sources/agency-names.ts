/**
 * RAPPROCHER DEUX NOMS D'AGENCE — et dire comment on s'y prend.
 *
 * Les portails ne publient aucun identifiant d'agence : seulement un nom, écrit
 * comme l'agence l'a saisi. La même enseigne apparaît donc en « Syngestone
 * Immo » chez Bien'ici et en « SYNGESTONE IMMO » chez la FNAIM, « Acropolis
 * Immo » et « Acropolis'immo », « L ADRESSE CEC » et « L'ADRESSE C.E.C.
 * GORBELLA ».
 *
 * TROIS RÈGLES, ET RIEN D'AUTRE :
 *   1. forme comparable — minuscules, sans accent ni ponctuation ;
 *   2. mots distinctifs — les mots du métier (« agence », « immobilier »,
 *      « nice », « gestion »…) ne rapprochent personne, il en reste trop peu ;
 *   3. forme tassée — sans espaces, un nom qui en contient un autre est le même.
 *
 * EN CAS DE DOUTE, ON SIGNALE. Manquer une agence non collectée coûte une
 * source ; en signaler une déjà couverte coûte une ligne à relire.
 *
 * Ce module ne connaît ni la base ni les e-mails : il compare des chaînes.
 */

import { comparable } from '../normalization/text.js';

/**
 * Mots du métier, qui ne distinguent aucune agence de sa voisine.
 *
 * « Loueur » et « professionnel » s'y ajoutent parce que MorningCroissant ne
 * nomme pas ses bailleurs : il écrit leur QUALITÉ. Trente-huit annonces étaient
 * ainsi attribuées à une agence nommée « Loueur professionnel ».
 */
export const AGENCY_STOPWORDS = new Set([
  'agence',
  'immobilier',
  'immobiliere',
  'immo',
  'cabinet',
  'gestion',
  'nice',
  'location',
  'locations',
  'syndic',
  'transaction',
  'transactions',
  'groupe',
  'residences',
  'residence',
  'sud',
  'nord',
  'est',
  'ouest',
  'centre',
  'cote',
  'azur',
  // « Habitat » nomme trois enseignes sans rapport — Square Habitat, CDC
  // Habitat, Habitat et Expertise : il les rapprochait toutes les trois.
  'habitat',
  'loueur',
  'loueurs',
  'professionnel',
  'professionnels',
  'particulier',
  'particuliers',
  'proprietaire',
  'bailleur',
]);

/**
 * Noms à NE PAS signaler même sans source correspondante : plateformes et
 * portails (ce ne sont pas des agences à collecter) et franchises déjà servies
 * par une source réseau.
 */
export const AGENCY_IGNORE = new Set([
  'locservice', // portail particulier↔particulier (écarté, non conforme)
  'spacest', // plateforme coliving (type Studapart)
  'manda', // plateforme de gestion en ligne (écartée, en veille)
  'lafage', // franchise Century 21 → déjà couverte par la source century21
]);

/** Mots distinctifs d'un nom d'agence (hors mots du métier). */
export function agencyTokens(name: string): readonly string[] {
  return comparable(name)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !AGENCY_STOPWORDS.has(token));
}

/** Forme « tassée » (sans espaces ni ponctuation) : rapproche « Nous Gérons » de « NousGérons ». */
export function agencySquish(name: string): string {
  return comparable(name).replace(/[^a-z0-9]/g, '');
}

/**
 * Les façons d'écrire une source : son nom, son identifiant et son domaine.
 *
 * Les trois servent, et pas par excès de zèle : « COT'OUEST IMMOBILIER » ne se
 * rapproche du nom « Cot'Ouest » que par le domaine `cot-ouest.fr`, et plusieurs
 * agences n'apparaissent chez les portails que sous la forme de leur adresse.
 */
export function sourceAliases(source: {
  readonly name: string;
  readonly id: string;
  readonly domain: string;
}): readonly string[] {
  return [
    source.name,
    source.id.replace(/-/g, ' '),
    source.domain
      .replace(/^www\./, '')
      .replace(/\.[a-z]{2,6}$/i, '')
      .replace(/[-.]/g, ' '),
  ];
}

export interface AgencyMatcher {
  /** `true` si ce nom correspond à un nom connu — ou s'il n'a rien de distinctif. */
  knows(name: string): boolean;
}

/**
 * Prépare la comparaison à une liste de noms connus.
 *
 * Fabrique et non fonction libre : les mots et les formes tassées des sources
 * sont calculés une fois, pas à chaque agence rencontrée.
 */
export function createAgencyMatcher(knownNames: readonly string[]): AgencyMatcher {
  const knownTokens = new Set(knownNames.flatMap(agencyTokens));
  // Formes tassées ≥ 8 caractères : assez longues pour qu'un fragment commun
  // ne rapproche pas deux agences distinctes.
  const knownSquished = knownNames.map(agencySquish).filter((one) => one.length >= 8);

  return {
    knows(name) {
      const tokens = agencyTokens(name);
      // Rien de distinctif : on n'affirme ni qu'on la connaît, ni le contraire.
      // Le silence est le seul choix honnête, et il évite de nommer « Agence
      // Immobilière » comme une source manquante.
      if (tokens.length === 0) return true;
      if (tokens.some((token) => AGENCY_IGNORE.has(token))) return true;
      const squished = agencySquish(name);
      return (
        tokens.some((token) => knownTokens.has(token)) ||
        knownSquished.some((known) => squished.includes(known) || known.includes(squished))
      );
    },
  };
}

/** Une agence vue dans les annonces d'un portail. */
export interface AgencySighting {
  readonly name: string;
  readonly sourceId: string;
  readonly listings: number;
}

/** Une agence regroupée sous toutes ses graphies. */
export interface AgencyGroup {
  /** Les graphies rencontrées, la plus courte d'abord. */
  readonly names: readonly string[];
  readonly listings: number;
  readonly sources: readonly string[];
}

/**
 * Regroupe les graphies d'une même agence.
 *
 * Deux temps : forme tassée identique, puis containment d'une forme dans
 * l'autre (« ladressecec » dans « ladresscececgorbella »). Le containment n'est
 * tenté qu'à partir de huit caractères, sinon « atica » entrerait dans la
 * moitié des noms.
 *
 * CE QUE ÇA NE RAPPROCHE PAS : deux graphies fautives (« CITYA DALBERA » et
 * « CITYA DALBERRA ») restent deux entrées. Il n'y a pas d'orthographe de
 * référence pour trancher, et inventer la correction serait pire.
 */
export function groupAgencyNames(sightings: readonly AgencySighting[]): readonly AgencyGroup[] {
  const byKey = new Map<string, { names: Set<string>; listings: number; sources: Set<string> }>();
  for (const sighting of sightings) {
    const key = agencySquish(sighting.name);
    if (key === '') continue;
    const group = byKey.get(key) ?? { names: new Set(), listings: 0, sources: new Set() };
    group.names.add(sighting.name);
    group.listings += sighting.listings;
    group.sources.add(sighting.sourceId);
    byKey.set(key, group);
  }

  // Du plus court au plus long : le nom court absorbe ses variantes allongées.
  const keys = [...byKey.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const absorbed = new Map<string, string>();
  for (const key of keys) {
    if (key.length < 8) continue;
    for (const other of keys) {
      if (other === key || other.length < key.length) continue;
      if (absorbed.has(other) || absorbed.get(key) !== undefined) continue;
      if (other.includes(key)) absorbed.set(other, key);
    }
  }

  const merged = new Map<string, { names: Set<string>; listings: number; sources: Set<string> }>();
  for (const key of keys) {
    const into = absorbed.get(key) ?? key;
    const group = byKey.get(key);
    if (group === undefined) continue;
    const target = merged.get(into) ?? { names: new Set(), listings: 0, sources: new Set() };
    for (const name of group.names) target.names.add(name);
    for (const source of group.sources) target.sources.add(source);
    target.listings += group.listings;
    merged.set(into, target);
  }

  return [...merged.values()].map((group) => ({
    names: [...group.names].sort((a, b) => a.length - b.length || a.localeCompare(b)),
    listings: group.listings,
    sources: [...group.sources].sort(),
  }));
}

export interface AgencyCoverage {
  /** Aucune source directe, et jamais étudiée : c'est la liste qui manque. */
  readonly uncovered: readonly AgencyGroup[];
  /** Déjà passées au crible et écartées : elles sont en veille, pas oubliées. */
  readonly studied: readonly AgencyGroup[];
}

/**
 * Les agences que les portails nous montrent sans qu'on les collecte.
 *
 * Une source directe publie en général plus tôt et plus complètement qu'un
 * portail : cette liste, classée par volume, dit où porter l'effort suivant.
 */
export function agencyCoverage(
  sightings: readonly AgencySighting[],
  knownSourceNames: readonly string[],
  studiedNames: readonly string[] = [],
): AgencyCoverage {
  const known = createAgencyMatcher(knownSourceNames);
  const studiedMatcher = createAgencyMatcher(studiedNames);
  const uncovered: AgencyGroup[] = [];
  const studied: AgencyGroup[] = [];

  for (const group of groupAgencyNames(sightings)) {
    if (group.names.some((name) => known.knows(name))) continue;
    if (studiedNames.length > 0 && group.names.some((name) => studiedMatcher.knows(name))) {
      studied.push(group);
      continue;
    }
    uncovered.push(group);
  }

  const byVolume = (a: AgencyGroup, b: AgencyGroup): number =>
    b.listings - a.listings || (a.names[0] ?? '').localeCompare(b.names[0] ?? '');
  return { uncovered: uncovered.sort(byVolume), studied: studied.sort(byVolume) };
}
