/**
 * COLLECTONS-NOUS CETTE AGENCE ? — et non « cette annonce-ci vient-elle de son
 * site ? », qui était la question posée jusqu'ici.
 *
 * L'ÉCRAN ANNONÇAIT 264 AGENCES NON SUIVIES, le relevé du collecteur en
 * trouvait 51. Deux règles écrites deux fois, et c'est la plus fausse qu'on
 * voyait. Sur les données du 2026-09-17, les 264 se décomposaient ainsi :
 *
 *   220  agences que nous collectons bel et bien — l'annonce était simplement
 *        arrivée par un portail, ce qui ne dit rien de la couverture ;
 *     4  graphies en double d'une même agence, comptées deux fois ;
 *    40  agences réellement sans source directe.
 *
 * La règle de rapprochement est maintenant celle du collecteur, importée de
 * `@maioun/shared` : mêmes formes comparables, mêmes mots distinctifs, même
 * abréviation « Immo » ↔ « Immobilier », et le même silence quand deux sources
 * se disputent un nom. Mieux vaut laisser une agence en « non suivie » que la
 * déclarer couverte à tort.
 */

import {
  agencySquish,
  agencyTokens,
  createAgencyMatcher,
  createAgencySourceResolver,
  sourceAliases,
  type AgencyHandle,
} from '@maioun/shared';
import { SOURCES, type SourceInfo } from './sources.generated.js';

/** Les sources telles que la règle de rapprochement veut les lire. */
function handles(table: Readonly<Record<string, SourceInfo>>): readonly AgencyHandle[] {
  return Object.entries(table).map(([id, info]) => ({
    id,
    name: info.name,
    domain: info.domain ?? '',
  }));
}

/**
 * Prépare la règle une fois pour la table donnée.
 *
 * Les formes tassées des deux cents sources sont calculées à la construction :
 * les recalculer à chaque agence de la liste ferait quatre cents fois le même
 * travail au rendu.
 */
function rules(table: Readonly<Record<string, SourceInfo>>): {
  readonly followed: (name: string) => boolean;
  readonly source: (name: string) => string | null;
} {
  const list = handles(table);
  const matcher = createAgencyMatcher(list.flatMap(sourceAliases));
  const resolver = createAgencySourceResolver(list);
  return { followed: (name) => matcher.knows(name), source: (name) => resolver.resolve(name) };
}

const DEFAULT_RULES = rules(SOURCES);

/**
 * `true` si une source collecte cette agence directement.
 *
 * Prudent par construction : un nom qui n'a rien de distinctif — « Agence
 * Immobilière », « Loueur professionnel » — répond `true`, car l'annoncer
 * comme une source manquante enverrait chercher une agence qui n'existe pas
 * sous ce nom.
 */
export function isFollowedAgency(
  name: string,
  table: Readonly<Record<string, SourceInfo>> = SOURCES,
): boolean {
  return (table === SOURCES ? DEFAULT_RULES : rules(table)).followed(name);
}

/**
 * La source qui collecte cette agence, quand on peut la NOMMER sans doute, et
 * `null` dès qu'il en reste deux.
 *
 * Nommer est bien plus exigeant que reconnaître : une réponse fausse colle le
 * logo et l'adresse d'une maison sous le nom d'une autre, et on les croit.
 *
 * UN NOM QUI NE DIT QUE LE MÉTIER, ET QUI N'EST QU'UN MORCEAU D'UN AUTRE, NE
 * NOMME PERSONNE. « Agence Immobilière » entre en entier dans « La Chouette
 * Agence Immobilière », et la règle de containment répondait donc
 * `la-chouette` : le logo et l'adresse d'une agence précise sous le nom de
 * n'importe quel annonceur anonyme.
 *
 * LA GARDE EST ÉTROITE, ET ELLE DOIT L'ÊTRE. Trente et un noms réels n'ont
 * aucun mot distinctif au sens de la règle — « CL IMMO », « MK Immo »,
 * « Cot'Ouest Immobilier », dont le sigle est trop court pour compter comme un
 * mot. Les écarter tous ferait perdre des réponses justes. On n'écarte donc
 * que le sens dangereux du containment : celui où c'est la SOURCE qui contient
 * le nom, et non l'inverse.
 */
export function agencySourceId(
  name: string,
  table: Readonly<Record<string, SourceInfo>> = SOURCES,
): string | null {
  const id = (table === SOURCES ? DEFAULT_RULES : rules(table)).source(name);
  if (id === null || agencyTokens(name).length > 0) return id;

  const info = table[id];
  if (info === undefined) return null;
  const forms = sourceAliases({ id, name: info.name, domain: info.domain ?? '' }).map(agencySquish);
  const squished = agencySquish(name);
  if (forms.includes(squished)) return id;
  // Le nom est un fragment du nom de la source, sans rien lui ajouter.
  return forms.some((form) => form.length > squished.length && form.includes(squished)) ? null : id;
}

/**
 * L'AGENCE EST COLLECTÉE, MAIS CETTE ANNONCE N'EST PAS VENUE DE CHEZ ELLE.
 *
 * C'est un défaut de couverture de parseur, pas un défaut de source : le bien
 * est en ligne chez l'agence, notre lecture de son site ne l'a pas vu, et il
 * n'est arrivé que par un portail — plus tard, et amputé de ce que le portail
 * coupe. C'est le plus gros trou mesuré à ce jour : 484 annonces, 94 agences.
 *
 * À NE PAS MÉLANGER avec « non suivie », qui dit l'inverse : là, il manque une
 * source ; ici, il manque une annonce à une source qui existe.
 */
export function hasParserGap(
  name: string,
  sources: readonly string[],
  table: Readonly<Record<string, SourceInfo>> = SOURCES,
): boolean {
  const id = agencySourceId(name, table);
  if (id === null || sources.includes(id)) return false;
  // Un nom d'agence qui désigne un PORTAIL — « LOCService », « MorningCroissant »
  // — ne dit rien d'un parseur d'agence : le portail n'a pas de catalogue
  // d'agence à relire. Un réseau, lui, en a un.
  const kind = table[id]?.kind;
  return kind === 'localAgency' || kind === 'agencyNetwork';
}
