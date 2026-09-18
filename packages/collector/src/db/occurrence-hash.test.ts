/**
 * Ce qui s'affiche doit être dans l'empreinte.
 *
 * L'empreinte décide s'il faut réécrire une occurrence. Un champ affiché mais
 * absent de l'empreinte devient donc incorrigible : la source peut le publier
 * autrement, la collecte juge l'annonce identique et ne touche que sa date de
 * dernière observation.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_CONTACT } from '@maioun/shared';
import type { NormalizedListing } from '@maioun/shared';
import { createRepository, occurrenceHash } from './repository.js';
import { openDatabase, type Database } from './client.js';
import { migrate } from './migrate.js';
import { silentLogger } from '../core/logger.js';
import { rederiveFromText } from '../normalization/normalize.js';

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../database/migrations',
);
import { makeOccurrence } from '../../../../tests/helpers/factories.js';

const bep = (reference: string | null) =>
  makeOccurrence({
    id: 'bep:87116070',
    sourceId: 'bep',
    contact: { ...EMPTY_CONTACT, agencyName: 'BEP Logement', reference },
  });

describe('occurrenceHash et la référence affichée', () => {
  it('change quand la référence corrigée remplace le numéro tiré de l’URL', () => {
    // Le cas réel : 87 occurrences BEP annonçaient leur identifiant Apimo, et
    // rien d'autre ne changeait le jour où on le remplace par « 0603220 ».
    expect(occurrenceHash(bep('0603220'))).not.toBe(occurrenceHash(bep('87116070')));
  });

  it('change quand une référence apparaît là où il n’y en avait aucune', () => {
    expect(occurrenceHash(bep('0603220'))).not.toBe(occurrenceHash(bep(null)));
  });

  it('laisse intacte l’empreinte des annonces sans référence publiée', () => {
    // Omise quand inconnue : sinon les 692 occurrences actives que leur source
    // ne référence pas changeraient d'empreinte sans raison.
    expect(occurrenceHash(bep(null))).toBe(
      occurrenceHash(
        makeOccurrence({
          id: 'bep:87116070',
          sourceId: 'bep',
          contact: { ...EMPTY_CONTACT, agencyName: 'BEP Logement' },
        }),
      ),
    );
  });
});

/**
 * CE QUE LE LOYER COMPREND décide du loyer retenu, donc du budget. Rentumo
 * publie hors charges et le dit depuis le 2026-09-16 ; treize annonces actives
 * portaient encore « inconnu » deux jours plus tard, parce que rien d'autre
 * n'avait changé et que la mention n'entrait pas dans l'empreinte.
 */
describe('occurrenceHash et ce que le loyer comprend', () => {
  const loyer = (chargesIncluded: boolean | null) =>
    makeOccurrence({
      id: 'rentumo:6536133',
      sourceId: 'rentumo',
      price: 670,
      charges: 40,
      chargesIncluded,
    });

  it('change quand la source dit enfin le loyer hors charges', () => {
    expect(occurrenceHash(loyer(false))).not.toBe(occurrenceHash(loyer(null)));
  });

  it('distingue un loyer charges comprises d’un loyer hors charges', () => {
    expect(occurrenceHash(loyer(true))).not.toBe(occurrenceHash(loyer(false)));
  });

  it('laisse intacte l’empreinte des annonces qui n’en disent rien', () => {
    expect(occurrenceHash(loyer(null))).toBe(
      occurrenceHash(
        makeOccurrence({ id: 'rentumo:6536133', sourceId: 'rentumo', price: 670, charges: 40 }),
      ),
    );
  });
});

/**
 * LA COMMUNE : dans l'empreinte, et dans ce que le rejeu ÉCRIT.
 *
 * Être dans l'empreinte ne suffit pas. Vingt-trois occurrences portaient
 * « voir l annonce » — le libellé d'un bouton pris pour une ville — et le rejeu
 * ne pouvait pas les réparer : sa requête de mise à jour ne touchait pas la
 * colonne. Une correction qu'aucune écriture ne transporte n'existe pas.
 */
describe('occurrenceHash et la commune affichée', () => {
  const alerte = (city: string | null) =>
    makeOccurrence({ id: 'email-alerts:seloger:12-590-06100', sourceId: 'email-alerts', city });

  it('change quand la commune corrigée remplace le libellé du bouton', () => {
    expect(occurrenceHash(alerte('nice'))).not.toBe(occurrenceHash(alerte('voir l annonce')));
  });

  it('change quand une commune fausse est retirée', () => {
    expect(occurrenceHash(alerte(null))).not.toBe(occurrenceHash(alerte('voir l annonce')));
  });
});

describe('le rejeu écrit bien la commune en base', () => {
  let db: Database;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
  });

  it('remplace « voir l annonce » par la commune que le titre publie', async () => {
    const repository = createRepository(db);
    const stockee = makeOccurrence({
      id: 'email-alerts:seloger:12-590-06100',
      sourceId: 'email-alerts',
      city: 'voir l annonce',
      postalCode: '06100',
      title: '1 pièce • 1 chambre • 12 m² Nice, 06100',
    });
    await repository.upsertOccurrences([stockee]);

    const corrigee = rederiveFromText(stockee);
    expect(corrigee?.city).toBe('nice');
    await repository.updateDerivedFields([corrigee as NormalizedListing]);

    const relue = (await repository.allActiveOccurrences())[0];
    expect(relue?.city).toBe('nice');
  });
});
