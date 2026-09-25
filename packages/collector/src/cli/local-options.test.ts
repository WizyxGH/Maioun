/**
 * `pnpm local` sert ET collecte. Les deux décisions qui précèdent comptent :
 * OÙ la collecte écrit, et À QUELLE CADENCE elle sollicite de vrais sites.
 */

import { describe, expect, it } from 'vitest';
import { cadence, environnementLocal, motAlertes } from './local-options.js';

describe('cadence', () => {
  it('collecte toutes les trente minutes par défaut', () => {
    expect(cadence([])).toEqual({ minutes: 30 });
  });

  it('suit la cadence demandée', () => {
    expect(cadence(['--toutes', '45'])).toEqual({ minutes: 45 });
  });

  // Une collecte complète dure ~9 min : en deçà de cinq, la cadence serait un
  // mensonge, et l'on harcèlerait les sites pour rien.
  it.each([['2'], ['0'], ['-5'], ['souvent'], [undefined]])('refuse « %s »', (valeur) => {
    const arguments_ = valeur === undefined ? ['--toutes'] : ['--toutes', valeur];
    expect(cadence(arguments_)).toHaveProperty('refus');
  });
});

describe('environnementLocal', () => {
  /**
   * LA GARDE QUI COMPTE. Sans `MAIOUN_LOCAL`, un `.env` renseigné enverrait la
   * collecte écrire dans TURSO — la production, depuis une commande qui dit
   * « local ».
   */
  it('impose le mode local, même avec un .env qui vise Turso', () => {
    const rendu = environnementLocal({
      TURSO_DATABASE_URL: 'libsql://exemple.example.invalid',
      TURSO_AUTH_TOKEN: 'jeton',
    });
    expect(rendu['MAIOUN_LOCAL']).toBe('1');
  });

  // `serve.ts` prend le miroir en priorité : sans ce réglage, on servirait une
  // copie figée pendant que la collecte remplit un autre fichier, et l'écran ne
  // bougerait pas sans que rien ne l'explique.
  it('sert le MÊME fichier que celui où la collecte écrit', () => {
    expect(environnementLocal({})['MAIOUN_LOCAL_DB']).toBe('data/local.db');
  });

  it('laisse passer le reste de l’environnement', () => {
    expect(environnementLocal({ PATH: '/usr/bin' })['PATH']).toBe('/usr/bin');
  });

  // NI POSÉ NI RETIRÉ : cette commande n'a pas à décider si les alertes partent.
  it('ne touche pas à MAIOUN_ALERTS', () => {
    expect(environnementLocal({})['MAIOUN_ALERTS']).toBeUndefined();
    expect(environnementLocal({ MAIOUN_ALERTS: '1' })['MAIOUN_ALERTS']).toBe('1');
  });
});

describe('motAlertes', () => {
  it('rassure quand rien ne partira', () => {
    expect(motAlertes({})).toMatch(/aucune ne partira/);
  });

  // Une boucle qui enverrait des alertes toutes les demi-heures sans le dire
  // serait la pire des surprises.
  it('avertit quand elles partiront', () => {
    expect(motAlertes({ MAIOUN_ALERTS: '1' })).toMatch(/PARTIRONT/);
  });
});
