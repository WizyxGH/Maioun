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
