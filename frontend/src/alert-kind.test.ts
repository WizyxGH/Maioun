/**
 * De quelle alerte relève une ligne d'historique.
 *
 * Deux familles n'y apparaissaient jamais — elles s'horodatent dans d'autres
 * colonnes que la requête ne regardait pas — et une annonce signalée parce
 * qu'elle est PROCHE des critères se lisait comme une nouveauté.
 */

import { describe, expect, it } from 'vitest';
import { alertEventOf, ALERT_LABELS } from './alert-kind.js';
import type { ListingView } from './types.js';

const listing = (over: Partial<ListingView>): ListingView =>
  ({ id: 'l1', matchesCriteria: true, ...over }) as unknown as ListingView;

describe('famille d’une alerte', () => {
  it('rend `null` quand l’annonce n’a jamais été signalée', () => {
    expect(alertEventOf(listing({}))).toBeNull();
  });

  it('distingue une nouveauté d’une annonce PROCHE des critères', () => {
    // Les deux s'horodatent dans la même colonne — c'est le même geste — et
    // seule la correspondance aux critères les sépare.
    const at = '2026-09-07T10:00:00.000Z';
    expect(alertEventOf(listing({ notifiedAt: at }))?.kind).toBe('new');
    expect(alertEventOf(listing({ notifiedAt: at, matchesCriteria: false }))?.kind).toBe(
      'nearMatch',
    );
  });

  it('reconnaît les deux familles qui n’atteignaient pas l’historique', () => {
    expect(alertEventOf(listing({ goneNotifiedAt: '2026-09-07T10:00:00.000Z' }))?.kind).toBe(
      'gone',
    );
    expect(alertEventOf(listing({ remindedAt: '2026-09-07T10:00:00.000Z' }))?.kind).toBe(
      'reminder',
    );
  });

  it('retient l’événement le PLUS RÉCENT quand il y en a plusieurs', () => {
    // Signalée lundi, favorite disparue jeudi : c'est la disparition qu'on
    // vient chercher, et c'est elle qui date la ligne.
    const event = alertEventOf(
      listing({
        notifiedAt: '2026-09-01T10:00:00.000Z',
        goneNotifiedAt: '2026-09-04T10:00:00.000Z',
      }),
    );
    expect(event?.kind).toBe('gone');
    expect(event?.at).toBe('2026-09-04T10:00:00.000Z');
  });

  it('ignore une date illisible plutôt que de la classer', () => {
    expect(alertEventOf(listing({ notifiedAt: 'pas une date' }))).toBeNull();
  });

  it('nomme chaque famille dans les mots de la notification reçue', () => {
    expect(ALERT_LABELS.new).toBe('Nouvelle annonce');
    expect(ALERT_LABELS.nearMatch).toBe('Proche de vos critères');
    expect(ALERT_LABELS.gone).toBe('Favori plus disponible');
    expect(ALERT_LABELS.reminder).toBe('Pas encore candidaté');
  });
});
