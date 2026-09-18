/**
 * Ce qui s'affiche doit être dans l'empreinte.
 *
 * L'empreinte décide s'il faut réécrire une occurrence. Un champ affiché mais
 * absent de l'empreinte devient donc incorrigible : la source peut le publier
 * autrement, la collecte juge l'annonce identique et ne touche que sa date de
 * dernière observation.
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_CONTACT } from '@maioun/shared';
import { occurrenceHash } from './repository.js';
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
