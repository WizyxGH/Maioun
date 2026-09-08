/**
 * ENGENDRÉ — ne pas modifier à la main.
 * Reconstruire avec `pnpm --filter @maioun/frontend run sources`.
 *
 * La table des sources, telle que le collecteur les déclare : un nom lisible et,
 * pour les agences qui ont leur propre site, son domaine.
 *
 * `domain` vaut `null` pour les portails : leur domaine n'est pas celui d'une
 * agence, et s'en servir comme logo donnerait la même image à des dizaines
 * d'agences distinctes.
 *
 * `logo` n'est renseigné que pour les agences dont l'icône N'EST PAS à
 * `/favicon.ico` — c'est l'adresse que leur site déclare lui-même.
 */

export interface SourceInfo {
  readonly name: string;
  readonly domain: string | null;
  readonly logo: string | null;
}

export const SOURCES: Readonly<Record<string, SourceInfo>> = {
  'acropolis-immo': { name: 'Acropolis Immobilier', domain: 'acropolisimmo.com', logo: null },
  'agence-du-centre': {
    name: 'Agence du Centre',
    domain: 'agenceducentrenice.com',
    logo: 'https://www.agenceducentrenice.com/images/favicon.png',
  },
  'agence-longchamp': { name: 'Agence Longchamp', domain: 'agencelongchamp.com', logo: null },
  'agence-victoire': {
    name: 'Agence de la Victoire',
    domain: 'agence-victoire-nice.com',
    logo: null,
  },
  akorimmo: { name: 'AKOR Immo', domain: 'akorimmo.com', logo: null },
  alberti: { name: 'Alberti Immobilier', domain: 'agencealbertinice.com', logo: null },
  'ashley-parker': { name: 'Ashley & Parker', domain: 'ashley-parker.fr', logo: null },
  beaumont: { name: 'Beaumont Immobilier', domain: 'beaumontimmo.com', logo: null },
  bep: { name: 'BEP Logement', domain: 'bep-logement.com', logo: null },
  'bep-abonnes': { name: 'BEP Logement (abonné)', domain: null, logo: null },
  'borne-delaunay': { name: 'Borne & Delaunay', domain: 'borne-delaunay.com', logo: null },
  centragence: { name: 'Centragence', domain: 'centragence.net', logo: null },
  century21: { name: 'Century 21', domain: null, logo: null },
  'cimiez-boulevard': {
    name: 'Cimiez Boulevard',
    domain: 'cimiez-boulevard.fr',
    logo: 'https://cimiez-boulevard.fr/build/assets/apple-icon-57x57-C4C4tfzi.png',
  },
  citya: { name: 'Citya Immobilier', domain: null, logo: null },
  climmo: { name: 'CL Immo Gestion', domain: 'climmo.com', logo: null },
  dazur: { name: "D'Azur Immobilier", domain: 'dazur.fr', logo: null },
  dgimmo: { name: 'DG Immo', domain: 'dgimmo.fr', logo: null },
  dinamy: {
    name: 'Dinamy Immobilier',
    domain: 'dinamyimmobilier.com',
    logo: 'https://dinamyimmobilier.com/Vues/Images/favicon.jpg',
  },
  drago: { name: 'Cabinet Drago', domain: 'cabinet-drago.com', logo: null },
  'email-alerts': { name: 'Alertes e-mail', domain: null, logo: null },
  era: { name: 'ERA Immobilier', domain: null, logo: null },
  fnaim: { name: 'FNAIM', domain: null, logo: null },
  foncia: { name: 'Foncia', domain: null, logo: null },
  'gestion-cassini': { name: 'Gestion Cassini', domain: 'gestioncassini.com', logo: null },
  giletta: {
    name: 'Giletta Immobilier',
    domain: 'giletta-properties.com',
    logo: 'https://www.giletta-properties.com/images/favicon.png',
  },
  'groupe-foch': { name: 'Foch Immobilier', domain: 'groupe-foch.com', logo: null },
  'ici-immobilier': {
    name: 'I.C.I Info Conseil Immobilier',
    domain: 'ici-immobilier.com',
    logo: null,
  },
  'immo-jbf': { name: 'Immo JBF', domain: 'immo-jbf.com', logo: null },
  'immo-sud': {
    name: 'Immo-Sud Nice',
    domain: 'agenceimmosud.com',
    logo: 'https://www.agenceimmosud.com/images/favicon.png',
  },
  immo3000: { name: 'Immo 3000', domain: 'immo3000.com', logo: null },
  'immobiliere-nicoise': {
    name: "L'Immobilière Niçoise",
    domain: 'immobiliere-nicoise.com',
    logo: 'https://www.immobiliere-nicoise.com/images/favicon.png',
  },
  inli: { name: "In'li", domain: 'inli.fr', logo: null },
  ladresse: { name: "L'Adresse", domain: 'ladresse.com', logo: null },
  laforet: { name: 'Laforêt', domain: null, logo: null },
  lamy: { name: 'Lamy Immobilier', domain: null, logo: null },
  'leprince-realty': { name: 'leprince realty', domain: 'leprincerealty.com', logo: null },
  locservice: { name: 'LocService', domain: null, logo: null },
  lodgis: { name: 'Lodgis', domain: null, logo: null },
  'lt-immobilier': {
    name: 'LT Immobilier',
    domain: 'lt-immobilier.com',
    logo: 'https://www.lt-immobilier.com/images/favicon.png',
  },
  mirabello: { name: 'Mirabello Immobilier', domain: 'mirabello-immobilier.com', logo: null },
  nousgerons: { name: 'NousGérons', domain: 'nousgerons.com', logo: null },
  orea: { name: 'Oréa Immobilier', domain: 'orea-immobilier.fr', logo: null },
  orpi: { name: 'Orpi', domain: null, logo: null },
  'palais-immobilier': { name: 'Palais Immobilier', domain: 'palaisimmobilier.com', logo: null },
  pap: { name: 'PAP', domain: null, logo: null },
  'partners-immo': { name: 'Partners Immo', domain: 'partners-immo.fr', logo: null },
  personalimmo: { name: 'Personal Immo', domain: 'personalimmo.fr', logo: null },
  privilege: { name: 'Agence Privilège', domain: 'agenceprivilege.com', logo: null },
  rentumo: { name: 'Rentumo', domain: null, logo: null },
  'saint-roch': {
    name: 'Saint Roch Immobilier',
    domain: 'saintrochimmobilier.com',
    logo: 'https://saintrochimmobilier.com/images/favicon.ico',
  },
  'savi-esteve': { name: 'Agence Savi Estève', domain: 'saviesteve-nice.com', logo: null },
  studapart: { name: 'Studapart', domain: null, logo: null },
  'votre-agence-immo': { name: 'Votre Agence Immo', domain: 'votre-agence-immo.fr', logo: null },
  winter: {
    name: 'Winter Immobilier',
    domain: 'agence-winter.com',
    logo: 'https://www.agence-winter.com/favicons/favicon.ico',
  },
};
