import { describe, expect, it } from 'vitest';
import {
  agencyCoverage,
  createAgencyMatcher,
  createAgencySourceResolver,
  groupAgencyNames,
  sourceAliases,
} from './agency-names.js';

const KNOWN = ['Cot’Ouest Immobilier', 'century21', 'bienici', 'Acropolis Immo'];

describe('createAgencyMatcher', () => {
  const matcher = createAgencyMatcher(KNOWN);

  it('rapproche malgré la casse, les accents et la ponctuation', () => {
    expect(matcher.knows("COT'OUEST IMMOBILIER")).toBe(true);
    expect(matcher.knows('Acropolis’immo')).toBe(true);
  });

  it('ne rapproche pas deux agences distinctes par un mot du métier', () => {
    expect(matcher.knows('Agence Immobilière du Port')).toBe(false);
  });

  it('n’affirme rien quand le nom ne dit que le métier', () => {
    // « Loueur professionnel » est la QUALITÉ du bailleur, pas son nom.
    expect(matcher.knows('Loueur professionnel')).toBe(true);
    expect(matcher.knows('AGENCE IMMOBILIERE')).toBe(true);
  });
});

describe('groupAgencyNames', () => {
  it('réunit les graphies d’une même agence', () => {
    const groups = groupAgencyNames([
      { name: 'Syngestone Immo', sourceId: 'bienici', listings: 3 },
      { name: 'SYNGESTONE IMMO', sourceId: 'fnaim', listings: 2 },
      { name: 'L ADRESSE CEC', sourceId: 'fnaim', listings: 13 },
      { name: "L'ADRESSE C.E.C.GORBELLA", sourceId: 'paruvendu', listings: 13 },
    ]);
    expect(groups).toHaveLength(2);
    const syngestone = groups.find((one) => one.names[0]?.toLowerCase().includes('syngestone'));
    expect(syngestone?.listings).toBe(5);
    expect(syngestone?.sources).toEqual(['bienici', 'fnaim']);
    const adresse = groups.find((one) => one.names[0]?.includes('ADRESSE'));
    expect(adresse?.listings).toBe(26);
  });

  it('ne corrige pas une faute de frappe : deux graphies fautives restent deux agences', () => {
    const groups = groupAgencyNames([
      { name: 'CITYA DALBERA', sourceId: 'fnaim', listings: 16 },
      { name: 'CITYA DALBERRA', sourceId: 'fnaim', listings: 16 },
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('agencyCoverage', () => {
  it('classe par volume et sépare ce qui a déjà été étudié', () => {
    const coverage = agencyCoverage(
      [
        { name: 'CONFIANCE IMMOBILIERE', sourceId: 'bienici', listings: 8 },
        { name: 'CONFIANCE IMMOBILIERE', sourceId: 'fnaim', listings: 5 },
        { name: 'HATON IMMOBILIER', sourceId: 'bienici', listings: 5 },
        { name: 'Acropolis’immo', sourceId: 'bienici', listings: 4 },
        { name: '123loger.com', sourceId: 'paruvendu', listings: 27 },
      ],
      KNOWN,
      ['123Loger'],
    );
    expect(coverage.uncovered.map((one) => one.names[0])).toEqual([
      'CONFIANCE IMMOBILIERE',
      'HATON IMMOBILIER',
    ]);
    expect(coverage.uncovered[0]?.listings).toBe(13);
    expect(coverage.studied.map((one) => one.names[0])).toEqual(['123loger.com']);
  });
});

describe('createAgencySourceResolver', () => {
  // Les vraies sources concernées, avec leurs vrais noms et domaines : ce sont
  // les formes que les digests d'exclusivité ont réellement écrites.
  const SOURCES = [
    { id: 'century21', name: 'Century 21', domain: 'century21.fr' },
    { id: 'procivis', name: 'Immo de France Côte d’Azur', domain: 'procivis.fr' },
    {
      id: 'concept-patrimoine',
      name: 'Concept Patrimoine Immobilier',
      domain: 'conceptpatrimoine.fr',
    },
    { id: 'am-concept', name: 'AM Concept Patrimoine Immobilier', domain: 'amconcept.fr' },
    { id: 'optimmo', name: 'Optimmo', domain: 'groupe-optimmo.fr' },
    { id: 'agir', name: 'Cabinet A.G.I.R.', domain: 'agir.immo' },
    { id: 'saint-roch', name: 'Saint Roch Immobilier', domain: 'saintrochimmobilier.com' },
    { id: 'palais-immobilier', name: 'Palais Immobilier', domain: 'palaisimmobilier.com' },
  ];
  const resolver = createAgencySourceResolver(SOURCES);

  it('désigne la source malgré la casse, la ponctuation et les mots en trop', () => {
    expect(resolver.resolve('IMMO DE FRANCE COTE D AZUR')).toBe('procivis');
    expect(resolver.resolve('A.G.I.R')).toBe('agir');
    expect(resolver.resolve('CENTURY 21 - AGENCE IMMOBILIERE LAFAGE')).toBe('century21');
    expect(resolver.resolve('GROUPE PALAIS IMMOBILIER VIEUX NICE')).toBe('palais-immobilier');
  });

  it('préfère le nom le plus complet quand deux sources se ressemblent', () => {
    // « AM Concept… » contient « Concept Patrimoine Immobilier » : c'est la
    // graphie exacte qui départage, pas le hasard de l'ordre.
    expect(resolver.resolve('CONCEPT PATRIMOINE IMMOBILIER MUSICIENS')).toBe('concept-patrimoine');
    expect(resolver.resolve('AM CONCEPT PATRIMOINE IMMOBILIER')).toBe('am-concept');
  });

  it('accepte un identifiant d’un seul mot comme nom', () => {
    expect(resolver.resolve('OPTIMMO NICE NORD')).toBe('optimmo');
  });

  it('ne désigne personne quand aucune source ne porte ce nom', () => {
    // Trois agences réellement vues par e-mail, qu'on ne collecte pas : elles
    // ne doivent réveiller aucune source, et surtout pas une voisine.
    expect(resolver.resolve('MK Immobilier')).toBeNull();
    expect(resolver.resolve('ERA MAC IMMOBILIER')).toBeNull();
    expect(resolver.resolve('PETROVA INVESTISSEMENT IMMOBILIER')).toBeNull();
  });

  it('ne se laisse pas prendre à un mot de lieu partagé', () => {
    // « saint » est dans « Saint Roch Immobilier » sans désigner cette agence.
    expect(resolver.resolve('AEQUALIS SAINT LAURENT DU VAR')).toBeNull();
    expect(resolver.resolve('AGENCES DE FRANCE')).toBeNull();
  });

  it('se tait sur un nom qui ne dit que le métier', () => {
    expect(resolver.resolve('Agence Immobilière')).toBeNull();
    expect(resolver.resolve('')).toBeNull();
  });
});

describe('sourceAliases', () => {
  it('donne le nom, l’identifiant et le domaine sans son extension', () => {
    expect(
      sourceAliases({ name: "Cot'Ouest", id: 'cot-ouest', domain: 'www.cot-ouest.fr' }),
    ).toEqual(["Cot'Ouest", 'cot ouest', 'cot ouest']);
  });
});
