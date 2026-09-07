import { describe, expect, it } from 'vitest';
import { makeOccurrence } from '../../../../tests/helpers/factories.js';
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

  it('laisse les garde-fous souverains', () => {
    // Même surface au centième, mais une autre commune : rien ne fusionne.
    const digest = bien('email-alerts', 22.81);
    const ailleurs = { ...bien('saint-roch', 22.81), city: 'cannes' };
    expect(similarity(digest, ailleurs).verdict).toBe('distinct');
  });
});
