import { describe, expect, it } from 'vitest';
import { makeContact, makeOccurrence } from '../../../../tests/helpers/factories.js';
import { similarity } from './similarity.js';

/**
 * DEUX CANAUX D'UNE MÊME MAISON. BEP Logement publie le même stock sur son site
 * public et dans son bulletin abonnés, avec des références, des titres et des
 * photos entièrement différents. Onze annonces s'affichaient en double, et rien
 * ne pouvait les rapprocher : prix, surface et pièces concordants ne pèsent que
 * quarante-deux points sur les soixante-dix exigés.
 */
describe('même opérateur, deux sources', () => {
  const operatorOf = (sourceId: string): string | null =>
    sourceId === 'bep' || sourceId === 'bep-abonnes' ? 'bep-logement' : null;

  const jumeau = (sourceId: string, ref: string) =>
    makeOccurrence({
      id: `${sourceId}:${ref}`,
      sourceId,
      sourceRef: ref,
      title: sourceId === 'bep' ? 'Deux pièces de 50m² avec balcon' : 'DEUX PIECES — CAGNES',
      price: 1200,
      area: 50,
      rooms: 2,
      city: 'cagnes sur mer',
      imageUrls: [`https://${sourceId}.invalid/${ref}.jpg`],
    });

  it('rapproche ce que rien d’autre ne rapprochait', () => {
    const a = jumeau('bep', '87315560');
    const b = jumeau('bep-abonnes', '1131663');
    // Sans la connaissance de l'opérateur : trop peu de points pour fusionner.
    expect(similarity(a, b).verdict).not.toBe('duplicate');
    // Avec : la fusion se fait.
    expect(similarity(a, b, () => false, operatorOf).verdict).toBe('duplicate');
  });

  /**
   * TRENTE POINTS, ET PAS DAVANTAGE : la fusion demande que TOUT concorde, pas
   * seulement l'opérateur. Les garde-fous restent souverains.
   */
  it('ne fusionne pas deux biens qu’un garde-fou sépare', () => {
    const a = jumeau('bep', '1');
    const b = { ...jumeau('bep-abonnes', '2'), city: 'nice' };
    expect(similarity(a, b, () => false, operatorOf).verdict).toBe('distinct');

    const grand = { ...jumeau('bep-abonnes', '3'), area: 80 };
    expect(similarity(a, grand, () => false, operatorOf).verdict).toBe('distinct');
  });

  it('ne s’applique pas à l’intérieur d’une même source', () => {
    const a = jumeau('bep', '1');
    const b = jumeau('bep', '2');
    const withOperator = similarity(a, b, () => false, operatorOf);
    expect(withOperator.signals.some((signal) => signal.code === 'operator')).toBe(false);
  });

  it('ne rapproche pas deux agences distinctes', () => {
    const a = jumeau('bep', '1');
    const b = { ...jumeau('bep-abonnes', '2'), sourceId: 'citya', id: 'citya:2' };
    expect(similarity(a, b, () => false, operatorOf).verdict).not.toBe('duplicate');
  });

  /**
   * IL A FALLU LE RESSERRER. Adossé aux tolérances — loyer à 6 % près, surface
   * à 5 % —, ce signal rapprochait des logements simplement voisins par la
   * taille et le prix. Et chaque rapprochement en vaut deux, l'union-find étant
   * transitive : mesuré sur l'inventaire, un groupe réunissait HUIT studios BEP
   * distincts, de 18 à 23 m² et de 750 à 850 €, enchaînés de proche en proche.
   */
  it('exige des chiffres IDENTIQUES, non simplement voisins', () => {
    const a = jumeau('bep', '1');

    // Dans la tolérance de prix (6 %), et pourtant pas le même bien.
    const presque = { ...jumeau('bep-abonnes', '2'), price: 1250 };
    const résultat = similarity(a, presque, () => false, operatorOf);
    expect(résultat.signals.some((signal) => signal.code === 'operator')).toBe(false);
    expect(résultat.verdict).not.toBe('duplicate');

    // Dans la tolérance de surface (5 %), pas davantage.
    const presqueGrand = { ...jumeau('bep-abonnes', '3'), area: 51 };
    expect(
      similarity(a, presqueGrand, () => false, operatorOf).signals.some(
        (signal) => signal.code === 'operator',
      ),
    ).toBe(false);
  });
});

/**
 * UNE SURFACE AU CENTIÈME PRÈS EST PRESQUE UN IDENTIFIANT.
 *
 * « 22 m² » est un arrondi que partagent des centaines de studios niçois ;
 * « 22,81 m² » est un mesurage que deux sources ne rencontrent pas par hasard.
 * C'est ce qui rattache les annonces des alertes de portails — dépourvues
 * d'adresse, de téléphone, de description et de photo commune — à la même
 * annonce publiée par l'agence, qui est visitable et qui expire correctement.
 */
describe('surface identique au centième', () => {
  const bien = (sourceId: string, area: number) =>
    makeOccurrence({
      id: `${sourceId}:1`,
      sourceId,
      title: sourceId === 'email-alerts' ? '1 pièce · 22,81 m²' : 'Studio meublé Saint Roch',
      price: 700,
      area,
      rooms: 1,
      city: 'nice',
      imageUrls: [`https://${sourceId}.invalid/photo.jpg`],
    });

  it('rapproche deux annonces qui publient la même décimale', () => {
    const digest = bien('email-alerts', 22.81);
    const agence = bien('saint-roch', 22.81);
    expect(similarity(digest, agence).verdict).toBe('duplicate');
  });

  it('NE rapproche PAS deux surfaces rondes, même égales', () => {
    // Le prix et la surface entière concordent aussi chez des centaines de
    // studios niçois : c'est la décimale qui distingue, pas l'égalité.
    const digest = bien('email-alerts', 22);
    const agence = bien('saint-roch', 22);
    expect(similarity(digest, agence).verdict).not.toBe('duplicate');
  });

  it('NE rapproche PAS deux décimales différentes', () => {
    const digest = bien('email-alerts', 22.81);
    const agence = bien('saint-roch', 22.85);
    expect(similarity(digest, agence).signals.some((signal) => signal.code === 'exactArea')).toBe(
      false,
    );
  });

  it('ne compte PAS au sein d’une même source', () => {
    // Deux annonces d'une même source à la même surface au centième ne se
    // ressemblent pas : elles trahissent un parseur qui recopie. Chez
    // L'Adresse, les treize annonces portaient toutes « 76,25 m² ».
    const une = { ...bien('ladresse', 76.25), price: 900 };
    const autre = { ...bien('ladresse', 76.25), id: 'ladresse:2', price: 952 };
    expect(similarity(une, autre).signals.some((signal) => signal.code === 'exactArea')).toBe(
      false,
    );
  });

  it('NE fusionne PAS deux annonces décrites sur la foi des seuls chiffres', () => {
    // Relevé réel : « F2 vide Parc Chambrun » et « 2 pièces meublé Pessicart »,
    // même loyer, même surface au centième — deux biens distincts.
    const texte = (lieu: string) => `${lieu}. `.repeat(12);
    const une = {
      ...bien('palais-immobilier', 51.2),
      title: 'F2 vide Parc Chambrun',
      description: texte('Parc Chambrun, vide'),
    };
    const autre = {
      ...bien('groupe-picado', 51.2),
      title: '2 pièces meublé Pessicart',
      description: texte('Pessicart, meublé'),
    };
    expect(similarity(une, autre).verdict).toBe('ambiguous');
  });

  it('laisse les garde-fous souverains', () => {
    // Même surface au centième, mais une autre commune : rien ne fusionne.
    const digest = bien('email-alerts', 22.81);
    const ailleurs = { ...bien('saint-roch', 22.81), city: 'cannes' };
    expect(similarity(digest, ailleurs).verdict).toBe('distinct');
  });
});

/** Alerte Bien'ici restée seule à côté de l'annonce Bien'ici qu'elle signale. */
describe('même page d’annonce', () => {
  const page = 'https://portail.example.invalid/annonce/ag000000-1';
  const alerte = makeOccurrence({
    id: 'email-alerts:portail:ag000000-1',
    sourceId: 'email-alerts',
    sourceUrl: page,
    title: 'Studio 20 m²',
    price: 675,
    area: 20,
    rooms: 1,
    city: null,
    postalCode: '06200',
    description: null,
    imageUrls: [],
  });
  const portail = makeOccurrence({
    id: 'portail:ag000000-1',
    sourceId: 'portail',
    sourceUrl: `${page}/`,
    title: 'STUDIO VIDE - BALCON - AU PIED DU TRAM',
    description: 'Joli studio vide moderne au 3e étage, balcon, coin cuisine. '.repeat(3),
    price: 675,
    area: 20,
    rooms: 1,
    city: 'nice',
    postalCode: '06200',
    contact: makeContact({ agencyName: 'Agence Exemple', providedBy: ['portail'] }),
    imageUrls: ['https://photos.example.invalid/1.jpg'],
  });

  it('fusionne une alerte avec l’annonce du portail vers laquelle elle renvoie', () => {
    const result = similarity(alerte, portail);
    expect(result.signals.map((s) => s.code)).toContain('url');
    expect(result.verdict).toBe('duplicate');
  });

  it('laisse les garde-fous souverains', () => {
    const autre = { ...portail, rooms: 2, area: 40 };
    expect(similarity(alerte, autre).verdict).toBe('distinct');
  });

  it('ignore un lien partagé au sein d’une source, ou une simple racine', () => {
    const liste = 'https://bulletin.example.invalid/w_index_abonnes.php';
    const a = makeOccurrence({ id: 'bulletin:1', sourceId: 'bulletin', sourceUrl: liste });
    const b = makeOccurrence({ id: 'bulletin:2', sourceId: 'bulletin', sourceUrl: liste });
    expect(similarity(a, b).signals.map((s) => s.code)).not.toContain('url');

    const racine = { ...alerte, sourceUrl: 'https://portail.example.invalid/' };
    const autreRacine = { ...portail, sourceUrl: 'https://portail.example.invalid' };
    expect(similarity(racine, autreRacine).signals.map((s) => s.code)).not.toContain('url');
  });

  it('distingue deux annonces dont seul le paramètre change', () => {
    const a = { ...alerte, sourceUrl: 'https://agence.example.invalid/bien.php?id=1' };
    const b = { ...portail, sourceUrl: 'https://agence.example.invalid/bien.php?id=2' };
    expect(similarity(a, b).signals.map((s) => s.code)).not.toContain('url');
  });
});

/** Relevé du 2026-09-15 : alertes SeLoger restées seules, doubles FNAIM enchaînés. */
describe('titre, adresse et même source', () => {
  const base = { price: 700, area: 21, rooms: 1, city: null, description: null, imageUrls: [] };

  it('un titre identique et parlant, écrit par l’agence, emporte la fusion', () => {
    const alerte = makeOccurrence({
      ...base,
      id: 'email-alerts:seloger:a',
      sourceId: 'email-alerts',
      title: 'NICE - STUDIO 21m2 - PROMENADES DES ANGLAIS',
      postalCode: '06200',
    });
    const agence = makeOccurrence({
      ...base,
      id: 'isit-immobilier:1',
      sourceId: 'isit-immobilier',
      title: 'NICE - STUDIO 21m2 - PROMENADES DES ANGLAIS',
      postalCode: '06000',
    });
    expect(similarity(alerte, agence).verdict).toBe('duplicate');
  });

  it('compte un titre coupé par le portail s’il commence l’autre', () => {
    const alerte = makeOccurrence({
      ...base,
      id: 'email-alerts:seloger:b',
      sourceId: 'email-alerts',
      title: 'Location Meublée Nice Port/Riquier - Studio Dernie...',
    });
    const agence = makeOccurrence({
      ...base,
      id: 'victor-hugo:1',
      sourceId: 'victor-hugo',
      title: 'Location Meublée Nice Port/Riquier - Studio Dernier Etage Terrasse',
    });
    expect(similarity(alerte, agence).signals.map((s) => s.code)).toContain('title');
  });

  /**
   * UN ESPACE AVANT LES POINTS DE SUSPENSION LAISSE LE DERNIER MOT ENTIER.
   *
   * Le portail coupe tantôt au milieu d'un mot (« Studio Dernie... »), tantôt
   * après lui (« SAINT ROCH ... »). Écarter le dernier mot dans les deux cas
   * jetait ici le seul mot distinctif : il ne restait que « saint », commun à
   * Saint-Roch, Saint-Augustin et Saint-Sylvestre, et le titre ne comptait plus.
   * L'alerte restait séparée de l'annonce du portail qui portait pourtant les
   * mêmes loyer, surface, pièces et code postal.
   */
  it('garde le dernier mot d’un titre coupé après un espace', () => {
    const commun = { ...base, price: 750, area: 38, rooms: 2, postalCode: '06300' };
    const alerte = makeOccurrence({
      ...commun,
      id: 'email-alerts:seloger:d',
      sourceId: 'email-alerts',
      title: 'Appartement Nice VIDE 2 pièce(s) 38 m2 SAINT ROCH ...',
    });
    const portail = makeOccurrence({
      ...commun,
      id: 'bienici:1',
      sourceId: 'bienici',
      title: 'Appartement Nice VIDE 2 pièce(s) 38 m2 SAINT ROCH avec TERRASE',
    });
    const resultat = similarity(alerte, portail);
    expect(resultat.signals.find((s) => s.code === 'title')?.label).toBe('même titre');
    expect(resultat.verdict).toBe('duplicate');
  });

  /**
   * LE GARDE-FOU TIENT TOUJOURS : garder le dernier mot ne dispense pas d'avoir
   * deux mots distinctifs. « Studio meublé à louer ... » n'en a aucun.
   */
  it('ne fusionne pas sur un titre coupé qui reste générique', () => {
    const alerte = makeOccurrence({
      ...base,
      id: 'email-alerts:seloger:e',
      sourceId: 'email-alerts',
      title: 'Appartement meublé à louer ...',
    });
    const agence = makeOccurrence({
      ...base,
      id: 'citya:1',
      sourceId: 'citya',
      title: 'Appartement meublé à louer studio lumineux',
    });
    expect(similarity(alerte, agence).verdict).not.toBe('duplicate');
  });

  it('ne tire rien d’un titre générique, même identique', () => {
    const a = makeOccurrence({
      ...base,
      id: 'locservice:1',
      sourceId: 'locservice',
      title: 'Studio meublé à louer Nice',
    });
    const b = makeOccurrence({
      ...base,
      id: 'bienici:1',
      sourceId: 'bienici',
      title: 'Studio meublé à louer Nice',
    });
    expect(similarity(a, b).verdict).not.toBe('duplicate');
  });

  it('reconnaît la même adresse malgré le bruit d’un titre coupé', () => {
    const a = makeOccurrence({
      ...base,
      id: 'email-alerts:c',
      sourceId: 'email-alerts',
      address: '49 BOULEVARD DE RIQUIER - NICE RIQUI',
    });
    const b = makeOccurrence({
      ...base,
      id: 'foncia:1',
      sourceId: 'foncia',
      address: '49 boulevard de Riquier',
    });
    const c = makeOccurrence({
      ...base,
      id: 'orpi:1',
      sourceId: 'orpi',
      address: '12 boulevard de Riquier',
    });
    expect(similarity(a, b).signals.map((s) => s.code)).toContain('address');
    expect(similarity(a, c).signals.map((s) => s.code)).not.toContain('address');
  });

  it('une voie sans numéro identique : même adresse entre sources, même rue dans une agence', () => {
    const parking = { ...base, area: null, rooms: null, price: 150, address: 'Rue Massenet' };
    const a = makeOccurrence({ ...parking, id: 'dazur:1', sourceId: 'dazur' });
    const b = makeOccurrence({ ...parking, id: 'dazur:2', sourceId: 'dazur' });
    const c = makeOccurrence({ ...parking, id: 'fnaim:3', sourceId: 'fnaim' });
    const sameAgency = similarity(a, b).signals.map((s) => s.code);
    expect(sameAgency).toContain('street');
    expect(sameAgency).not.toContain('address');
    expect(similarity(a, c).signals.map((s) => s.code)).toContain('address');
  });

  it('sépare deux annonces d’une même source aux codes postaux différents', () => {
    const a = makeOccurrence({
      ...base,
      id: 'fnaim:1',
      sourceId: 'fnaim',
      postalCode: '06000',
      title: 'Appartement 1 pièce 20m² NICE 06000',
    });
    const b = makeOccurrence({
      ...base,
      id: 'fnaim:2',
      sourceId: 'fnaim',
      postalCode: '06300',
      title: 'Appartement 1 pièce 20m² NICE 06300',
    });
    expect(similarity(a, b).verdict).toBe('distinct');
    // Pas les alertes : SeLoger donne deux codes au même studio.
    const x = makeOccurrence({
      ...base,
      id: 'email-alerts:x',
      sourceId: 'email-alerts',
      postalCode: '06000',
    });
    const y = makeOccurrence({
      ...base,
      id: 'email-alerts:y',
      sourceId: 'email-alerts',
      postalCode: '06200',
    });
    expect(similarity(x, y).blocker).toBeNull();
  });
});

/**
 * PARUVENDU NE REPUBLIE RIEN DE COMMUN — sauf les photos.
 *
 * Ni code postal (absent 224 fois sur 299), ni téléphone (aucune des 299), et
 * un identifiant maison là où Bien'ici reprend celui du logiciel de l'agence.
 * Loyer, surface et pièces concordants ne font que quarante-deux points sur les
 * soixante-dix exigés : l'annonce restait seule, sans adresse ni contact, et
 * comptait comme « manquée » alors qu'elle était déjà collectée chez l'agence.
 *
 * SON REDIMENSIONNEUR TRANSPORTE POURTANT L'ADRESSE DU FICHIER DE L'AGENCE.
 * La rendre suffit : le cliché redevient commun, et c'est LUI qui rapproche.
 */
describe('photo d’agence servie par le redimensionneur d’un portail', () => {
  const PHOTO_AGENCE =
    'https://media.agence.example.invalid/cache/8f3c21d0aa47bb19_2c7e5b_1600-original.jpg';
  const PHOTO_PORTAIL =
    'https://img.paruvendu.fr/media_ext/_https_/media.agence.example.invalid/17/fe/' +
    'L2NhY2hlLzhmM2MyMWQwYWE0N2JiMTlfMmM3ZTViXzE2MDAtb3JpZ2luYWwuanBn_rct?func=crop&w=320';

  const chezLAgence = makeOccurrence({
    id: 'agence-x:87280764',
    sourceId: 'agence-x',
    title: 'Studio meublé rue des Oliviers',
    price: 850,
    area: 21,
    rooms: 1,
    city: 'nice',
    imageUrls: [PHOTO_AGENCE],
    contact: makeContact({ agencyName: 'AGENCE X NICE', reference: '87280764' }),
  });

  /** Le portail ne donne qu'un gabarit de titre, aucun contact, aucun code postal. */
  const surLePortail = makeOccurrence({
    id: 'paruvendu:1295241097',
    sourceId: 'paruvendu',
    title: 'Appartement - 1 pièce(s) - 21 m²',
    description: null,
    price: 850,
    area: 21,
    rooms: 1,
    city: 'nice',
    postalCode: null,
    imageUrls: [PHOTO_PORTAIL],
    // Le portail ne publie ni téléphone ni courriel, et pose son propre numéro.
    contact: makeContact({
      agencyName: 'AGENCE X LOGEMENT',
      phone: null,
      email: null,
      reference: '1295241097',
    }),
  });

  it('rapproche l’annonce du portail de celle de l’agence', () => {
    const result = similarity(chezLAgence, surLePortail);
    expect(result.verdict).toBe('duplicate');
    expect(result.signals.map((signal) => signal.code)).toContain('image');
  });

  /**
   * LE SIGNAL DÉCISIF EST LA PHOTO, PAS LES CHIFFRES. Retirée l'enveloppe, les
   * mêmes deux annonces retombent sous le seuil : c'est la preuve que rien
   * d'autre ne les fusionne, et donc que la règle ne fusionne que sur le
   * fichier commun.
   */
  it('sans le fichier commun, les mêmes chiffres ne suffisent pas', () => {
    const sansPhoto = { ...surLePortail, imageUrls: ['https://img.paruvendu.fr/pixel.gif'] };
    expect(similarity(chezLAgence, sansPhoto).verdict).not.toBe('duplicate');
  });

  /**
   * DEUX STUDIOS DISTINCTS D'UNE MÊME RÉSIDENCE portent les mêmes chiffres au
   * centime et au centimètre — c'est le cas ordinaire, pas l'exception. Sans
   * cliché commun, ils doivent rester deux. Les fusionner en ferait disparaître
   * un de la liste, en silence.
   */
  it('ne fusionne pas deux logements distincts aux chiffres identiques', () => {
    const voisin = makeOccurrence({
      id: 'agence-x:87280765',
      sourceId: 'agence-x',
      title: 'Studio meublé rue des Oliviers',
      price: 850,
      area: 21,
      rooms: 1,
      city: 'nice',
      imageUrls: [
        'https://media.agence.example.invalid/cache/11aa22bb33cc44dd_9f8e7d_1600-original.jpg',
      ],
      contact: makeContact({ agencyName: 'AGENCE X NICE', reference: '87280765' }),
    });
    const result = similarity(voisin, surLePortail);
    expect(result.verdict).not.toBe('duplicate');
    expect(result.signals.some((signal) => signal.code === 'image')).toBe(false);
  });
});
