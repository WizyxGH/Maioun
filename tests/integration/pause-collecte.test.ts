/**
 * LA PAUSE DE COLLECTE, et surtout sa fin.
 *
 * Une pause qui ne se lèverait pas éteindrait le site sans que rien ne le
 * dise — l'inverse exact du bruit qu'elle vient supprimer. Ces scénarios
 * tiennent les deux bords : elle se lève le jour dit, et toute valeur douteuse
 * laisse collecter.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — script Node en JavaScript, sans déclaration de types.
import { aujourdhuiUtc, decision } from '../../scripts/pause-collecte.mjs';

const juger = decision as (
  jusquAu: string | undefined,
  aujourdhui: string,
) => { collecter: boolean; raison: string };

describe('pause de collecte', () => {
  it('saute la collecte tant que la date n’est pas venue', () => {
    const rendu = juger('2026-10-01', '2026-09-25');
    expect(rendu.collecter).toBe(false);
    expect(rendu.raison).toMatch(/2026-10-01/);
  });

  // LE SCÉNARIO QUI COMPTE : personne ne revient lever la pause à la main.
  it('repart le jour dit, puis les suivants', () => {
    expect(juger('2026-10-01', '2026-10-01').collecter).toBe(true);
    expect(juger('2026-10-01', '2026-10-14').collecter).toBe(true);
  });

  it('collecte quand aucune pause n’est posée', () => {
    expect(juger(undefined, '2026-09-25').collecter).toBe(true);
    expect(juger('  ', '2026-09-25').collecter).toBe(true);
  });

  // Se tromper du bon côté : une valeur qu'on ne sait pas lire ne doit pas
  // décider d'un arrêt.
  it.each([['1er octobre'], ['2026-13-99'], ['2026/10/01'], ['true']])(
    'collecte malgré « %s », illisible',
    (valeur) => {
      const rendu = juger(valeur, '2026-09-25');
      expect(rendu.collecter).toBe(true);
      expect(rendu.raison).toMatch(/illisible/);
    },
  );

  // `2027-10-01` pour `2026-10-01` : un an de silence pour un chiffre.
  it('refuse une pause trop longue pour un quota mensuel', () => {
    const rendu = juger('2027-10-01', '2026-09-25');
    expect(rendu.collecter).toBe(true);
    expect(rendu.raison).toMatch(/trop longue/);
  });

  it('accepte la plus longue pause plausible', () => {
    expect(juger('2026-11-01', '2026-10-01').collecter).toBe(false);
  });
});

describe('aujourdhuiUtc', () => {
  // La forge raisonne en UTC ; une date locale ferait repartir la collecte un
  // jour trop tôt ou trop tard selon le fuseau de qui l'a posée.
  it('rend la date UTC, pas la date locale', () => {
    const rendu = (aujourdhuiUtc as (maintenant?: Date) => string)(
      new Date('2026-10-01T00:30:00Z'),
    );
    expect(rendu).toBe('2026-10-01');
  });
});
