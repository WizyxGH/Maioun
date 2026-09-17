/**
 * RAPPROCHER DEUX NOMS D'AGENCE — et dire comment on s'y prend.
 *
 * Les portails ne publient aucun identifiant d'agence : seulement un nom, écrit
 * comme l'agence l'a saisi. La même enseigne apparaît donc en « Syngestone
 * Immo » chez Bien'ici et en « SYNGESTONE IMMO » chez la FNAIM, « Acropolis
 * Immo » et « Acropolis'immo », « L ADRESSE CEC » et « L'ADRESSE C.E.C.
 * GORBELLA ».
 *
 * QUATRE RÈGLES, ET RIEN D'AUTRE :
 *   1. forme comparable — minuscules, sans accent ni ponctuation ;
 *   2. mots distinctifs — les mots du métier (« agence », « immobilier »,
 *      « nice », « gestion »…) ne rapprochent personne, il en reste trop peu ;
 *   3. forme tassée — sans espaces, un nom qui en contient un autre est le même ;
 *   4. abréviation — « immobilier » et « immo » sont le même mot, et seule cette
 *      abréviation-là est reconnue ; elle ne sert qu'à désigner une source.
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
 * Forme tassée où « immobilier » et « immobilière » sont ramenés à « immo ».
 *
 * C'est le même mot, abrégé : l'enseigne qui s'écrit « MK Immo » sur son site
 * signe « MK IMMOBILIER » dans un e-mail. Rien d'autre ne sépare ces deux
 * graphies, mais le sigle « MK » est trop court pour être un mot distinctif et
 * « mkimmo » trop court pour la règle de containment — le nom restait sans
 * source, annoncé comme une agence non couverte alors qu'on la collecte.
 *
 * SEULE L'ABRÉVIATION EST RAMENÉE. « CDC Habitat », bailleur national, ne
 * devient pas « CDC Immobilier », agence de la place Wilson : les deux n'ont en
 * commun que trois lettres, et les rapprocher enverrait chercher une annonce là
 * où elle n'est pas.
 */
export function agencyAbbreviated(name: string): string {
  return agencySquish(name).replace(/immobiliere?/g, 'immo');
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

/**
 * DÉSIGNER LA SOURCE QUI COLLECTE CETTE AGENCE — et se taire au moindre doute.
 *
 * `createAgencyMatcher` répond « connue ou pas » ; ici il faut NOMMER la
 * source, ce qui demande bien plus de rigueur : une réponse fausse envoie un
 * passage chez la mauvaise agence, et l'annonce attendue n'arrive jamais.
 * Quatre règles, de la plus sûre à la plus faible, et `null` dès qu'il reste
 * deux candidates.
 *
 * Vérifié sur les 487 noms d'annonceur relevés en base, dont 241 dont on
 * connaît la source d'origine : 207 désignations justes, 29 silences, et cinq
 * écarts qui nomment tous l'agence locale plutôt que son réseau (« Orpi —
 * Immobilière GTI » → `igti`), ce qui est le meilleur choix des deux. La règle
 * d'abréviation n'a rien changé à ce relevé : elle ne rattrape que des graphies
 * qu'aucun portail n'écrit, et que les e-mails, eux, écrivent.
 */
export interface AgencySourceResolver {
  /** L'identifiant de la source, ou `null` : aucune, ou plusieurs. */
  resolve(name: string): string | null;
}

/** Ce qu'il faut savoir d'une source pour la reconnaître sous un nom d'agence. */
export interface AgencyHandle {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
}

/**
 * Longueur d'un mot d'identifiant qui suffit à désigner une source.
 *
 * Six lettres, et un identifiant d'un seul mot : « optimmo » nomme une agence,
 * « saint » ou « invest » ne nomment qu'un morceau de la moitié du parc — ils
 * rapprochaient « AEQUALIS SAINT LAURENT DU VAR » de Saint Roch Immobilier.
 */
const ID_WORD_MIN = 6;

/**
 * Longueur d'une forme abrégée qui nomme quelqu'un.
 *
 * Six : « immo » seul n'en compte que quatre et ne désigne aucune agence. On
 * exige deux lettres de plus, ce qui suffit au plus court des sigles réels.
 */
const ABBREV_MIN = 6;

export function createAgencySourceResolver(sources: readonly AgencyHandle[]): AgencySourceResolver {
  const bySquish = new Map<string, Set<string>>();
  const byAbbrev = new Map<string, Set<string>>();
  const byIdWord = new Map<string, Set<string>>();

  const record = (index: Map<string, Set<string>>, key: string, id: string): void => {
    const ids = index.get(key) ?? new Set<string>();
    ids.add(id);
    index.set(key, ids);
  };

  for (const source of sources) {
    for (const alias of sourceAliases(source)) {
      const squished = agencySquish(alias);
      if (squished.length >= 4) record(bySquish, squished, source.id);
      const abbreviated = agencyAbbreviated(alias);
      if (abbreviated.length >= ABBREV_MIN) record(byAbbrev, abbreviated, source.id);
    }
    // L'identifiant d'un seul mot est un nom à lui seul ; celui qui en compte
    // deux ne se reconnaît pas à l'un d'eux.
    const words = agencyTokens(source.id.replace(/-/g, ' '));
    const word = words.length === 1 ? words[0] : undefined;
    if (word !== undefined && word.length >= ID_WORD_MIN) record(byIdWord, word, source.id);
  }

  const alone = (ids: Set<string> | undefined): string | null =>
    ids !== undefined && ids.size === 1 ? (ids.values().next().value ?? null) : null;

  return {
    resolve(name) {
      const squished = agencySquish(name);
      if (squished === '') return null;

      // 1. Même forme tassée : « IMMO DE FRANCE COTE D AZUR » est la source.
      const exact = alone(bySquish.get(squished));
      if (exact !== null) return exact;

      // 2. L'un contient l'autre, à partir de huit caractères : « CONCEPT
      //    PATRIMOINE IMMOBILIER MUSICIENS » porte le nom de son agence.
      if (squished.length >= 8) {
        const near = new Set<string>();
        for (const [key, ids] of bySquish) {
          if (key.length < 8) continue;
          if (squished.includes(key) || key.includes(squished)) for (const id of ids) near.add(id);
        }
        const one = alone(near);
        if (one !== null) return one;
        // Plusieurs sources contenues dans le même nom : on ne tranche pas, et
        // surtout on ne redescend pas à la règle plus faible.
        if (near.size > 1) return null;
      }

      // 3. Un mot d'identifiant, seul de son espèce : « OPTIMMO NICE NORD ».
      const byWord = new Set<string>();
      for (const token of agencyTokens(name)) {
        const ids = byIdWord.get(token);
        if (ids !== undefined && ids.size === 1) for (const id of ids) byWord.add(id);
      }
      const named = alone(byWord);
      if (named !== null) return named;

      // 4. Le même nom à l'abréviation près : « MK IMMOBILIER » est « MK Immo ».
      //    En dernier, et sur l'égalité seule : aucun containment ici, sans quoi
      //    la moitié des enseignes se contiendraient par leur « immo ».
      const abbreviated = agencyAbbreviated(name);
      return abbreviated.length >= ABBREV_MIN ? alone(byAbbrev.get(abbreviated)) : null;
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
