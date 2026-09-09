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
 *
 * `paidContact` marque les sources qui FONT PAYER la mise en relation :
 * l'écran le dit avant le clic, plutôt que de laisser découvrir le péage.
 */

export interface SourceInfo {
  readonly name: string;
  readonly domain: string | null;
  readonly logo: string | null;
  /** La source vend la mise en relation : ses coordonnées ne sont pas libres. */
  readonly paidContact: boolean;
}

export const SOURCES: Readonly<Record<string, SourceInfo>> = {
  'acropolis-immo': {
    name: 'Acropolis Immobilier',
    domain: 'acropolisimmo.com',
    logo: null,
    paidContact: false,
  },
  'agence-du-centre': {
    name: 'Agence du Centre',
    domain: 'agenceducentrenice.com',
    logo: 'https://www.agenceducentrenice.com/images/favicon.png',
    paidContact: false,
  },
  'agence-longchamp': {
    name: 'Agence Longchamp',
    domain: 'agencelongchamp.com',
    logo: null,
    paidContact: false,
  },
  'agence-victoire': {
    name: 'Agence de la Victoire',
    domain: 'agence-victoire-nice.com',
    logo: null,
    paidContact: false,
  },
  akorimmo: { name: 'AKOR Immo', domain: 'akorimmo.com', logo: null, paidContact: false },
  alberti: {
    name: 'Alberti Immobilier',
    domain: 'agencealbertinice.com',
    logo: null,
    paidContact: false,
  },
  arthurimmo: { name: 'Arthurimmo.com Nice', domain: null, logo: null, paidContact: false },
  'ashley-parker': {
    name: 'Ashley & Parker',
    domain: 'ashley-parker.fr',
    logo: null,
    paidContact: false,
  },
  beaumont: {
    name: 'Beaumont Immobilier',
    domain: 'beaumontimmo.com',
    logo: null,
    paidContact: false,
  },
  bep: { name: 'BEP Logement', domain: 'bep-logement.com', logo: null, paidContact: false },
  'bep-abonnes': { name: 'BEP Logement (abonné)', domain: null, logo: null, paidContact: false },
  bienici: { name: 'Bien’ici', domain: null, logo: null, paidContact: false },
  'borne-delaunay': {
    name: 'Borne & Delaunay',
    domain: 'borne-delaunay.com',
    logo: null,
    paidContact: false,
  },
  centragence: { name: 'Centragence', domain: 'centragence.net', logo: null, paidContact: false },
  century21: { name: 'Century 21', domain: null, logo: null, paidContact: false },
  'cimiez-boulevard': {
    name: 'Cimiez Boulevard',
    domain: 'cimiez-boulevard.fr',
    logo: 'https://cimiez-boulevard.fr/build/assets/apple-icon-57x57-C4C4tfzi.png',
    paidContact: false,
  },
  citya: { name: 'Citya Immobilier', domain: null, logo: null, paidContact: false },
  climmo: { name: 'CL Immo Gestion', domain: 'climmo.com', logo: null, paidContact: false },
  dazur: { name: "D'Azur Immobilier", domain: 'dazur.fr', logo: null, paidContact: false },
  dgimmo: { name: 'DG Immo', domain: 'dgimmo.fr', logo: null, paidContact: false },
  dinamy: {
    name: 'Dinamy Immobilier',
    domain: 'dinamyimmobilier.com',
    logo: 'https://dinamyimmobilier.com/Vues/Images/favicon.jpg',
    paidContact: false,
  },
  drago: { name: 'Cabinet Drago', domain: 'cabinet-drago.com', logo: null, paidContact: false },
  'email-alerts': { name: 'Alertes e-mail', domain: null, logo: null, paidContact: false },
  era: { name: 'ERA Immobilier', domain: null, logo: null, paidContact: false },
  fnaim: { name: 'FNAIM', domain: null, logo: null, paidContact: false },
  foncia: { name: 'Foncia', domain: null, logo: null, paidContact: false },
  'gestion-cassini': {
    name: 'Gestion Cassini',
    domain: 'gestioncassini.com',
    logo: null,
    paidContact: false,
  },
  giletta: {
    name: 'Giletta Immobilier',
    domain: 'giletta-properties.com',
    logo: 'https://www.giletta-properties.com/images/favicon.png',
    paidContact: false,
  },
  'groupe-foch': {
    name: 'Foch Immobilier',
    domain: 'groupe-foch.com',
    logo: null,
    paidContact: false,
  },
  'ici-immobilier': {
    name: 'I.C.I Info Conseil Immobilier',
    domain: 'ici-immobilier.com',
    logo: null,
    paidContact: false,
  },
  'immo-jbf': { name: 'Immo JBF', domain: 'immo-jbf.com', logo: null, paidContact: false },
  'immo-sud': {
    name: 'Immo-Sud Nice',
    domain: 'agenceimmosud.com',
    logo: 'https://www.agenceimmosud.com/images/favicon.png',
    paidContact: false,
  },
  immo3000: { name: 'Immo 3000', domain: 'immo3000.com', logo: null, paidContact: false },
  'immobiliere-nicoise': {
    name: "L'Immobilière Niçoise",
    domain: 'immobiliere-nicoise.com',
    logo: 'https://www.immobiliere-nicoise.com/images/favicon.png',
    paidContact: false,
  },
  inli: { name: "In'li", domain: 'inli.fr', logo: null, paidContact: false },
  ladresse: { name: "L'Adresse", domain: 'ladresse.com', logo: null, paidContact: false },
  laforet: { name: 'Laforêt', domain: null, logo: null, paidContact: false },
  lamy: { name: 'Lamy Immobilier', domain: null, logo: null, paidContact: false },
  'leprince-realty': {
    name: 'leprince realty',
    domain: 'leprincerealty.com',
    logo: null,
    paidContact: false,
  },
  locservice: { name: 'LocService', domain: null, logo: null, paidContact: true },
  lodgis: { name: 'Lodgis', domain: null, logo: null, paidContact: false },
  'lt-immobilier': {
    name: 'LT Immobilier',
    domain: 'lt-immobilier.com',
    logo: 'https://www.lt-immobilier.com/images/favicon.png',
    paidContact: false,
  },
  mirabello: {
    name: 'Mirabello Immobilier',
    domain: 'mirabello-immobilier.com',
    logo: null,
    paidContact: false,
  },
  nousgerons: { name: 'NousGérons', domain: 'nousgerons.com', logo: null, paidContact: false },
  orea: { name: 'Oréa Immobilier', domain: 'orea-immobilier.fr', logo: null, paidContact: false },
  orpi: { name: 'Orpi', domain: null, logo: null, paidContact: false },
  'palais-immobilier': {
    name: 'Palais Immobilier',
    domain: 'palaisimmobilier.com',
    logo: null,
    paidContact: false,
  },
  pap: { name: 'PAP', domain: null, logo: null, paidContact: false },
  'partners-immo': {
    name: 'Partners Immo',
    domain: 'partners-immo.fr',
    logo: null,
    paidContact: false,
  },
  personalimmo: {
    name: 'Personal Immo',
    domain: 'personalimmo.fr',
    logo: null,
    paidContact: false,
  },
  privilege: {
    name: 'Agence Privilège',
    domain: 'agenceprivilege.com',
    logo: null,
    paidContact: false,
  },
  rentumo: { name: 'Rentumo', domain: null, logo: null, paidContact: false },
  'saint-roch': {
    name: 'Saint Roch Immobilier',
    domain: 'saintrochimmobilier.com',
    logo: 'https://saintrochimmobilier.com/images/favicon.ico',
    paidContact: false,
  },
  'savi-esteve': {
    name: 'Agence Savi Estève',
    domain: 'saviesteve-nice.com',
    logo: null,
    paidContact: false,
  },
  studapart: { name: 'Studapart', domain: null, logo: null, paidContact: false },
  'votre-agence-immo': {
    name: 'Votre Agence Immo',
    domain: 'votre-agence-immo.fr',
    logo: null,
    paidContact: false,
  },
  winter: {
    name: 'Winter Immobilier',
    domain: 'agence-winter.com',
    logo: 'https://www.agence-winter.com/favicons/favicon.ico',
    paidContact: false,
  },
};
