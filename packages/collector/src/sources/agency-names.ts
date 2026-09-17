/**
 * RAPPROCHER DEUX NOMS D'AGENCE — la règle vit maintenant dans `@maioun/shared`.
 *
 * Elle était ici, et le site ne pouvait pas l'importer : l'écran des agences
 * s'en était donc écrit une autre, plus faible, qui répondait 264 là où ce
 * relevé répond 51. Une règle qui a deux écritures finit toujours par avoir
 * deux réponses, et c'est la plus visible qui se trompe.
 *
 * Ce fichier ne garde que le chemin d'accès, pour les parseurs et le relevé de
 * couverture qui la cherchent ici depuis toujours.
 */

export {
  AGENCY_IGNORE,
  AGENCY_STOPWORDS,
  agencyAbbreviated,
  agencyCoverage,
  agencySquish,
  agencyTokens,
  createAgencyMatcher,
  createAgencySourceResolver,
  groupAgencyNames,
  sourceAliases,
  type AgencyCoverage,
  type AgencyGroup,
  type AgencyHandle,
  type AgencyMatcher,
  type AgencySighting,
  type AgencySourceResolver,
} from '@maioun/shared';
