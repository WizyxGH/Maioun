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
});
