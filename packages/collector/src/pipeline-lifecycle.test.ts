/**
 * Peut-on conclure à une absence, ou n'a-t-on pas tout regardé ?
 *
 * La fonction est le garde qui empêche le pipeline d'éteindre des annonces
 * vivantes : faute de preuve, rien ne bouge. Elle doit donc être prudente sur
 * CHAQUE motif d'arrêt, y compris ceux qu'aucune source ne déclare
 * volontairement. Le cas de LocService, qu'elle a laissé passer soixante-et-onze
 * fois, tient en un test.
 */

import { describe, expect, it } from 'vitest';
import type { StopReason } from '@maioun/shared';
import { missingWouldBeUnfounded } from './pipeline.js';

/** Un dépôt qui ne connaît rien : le compte n'y change rien ici. */
const vide = {
  activeOccurrenceCount: () => Promise.resolve(0),
} as unknown as Parameters<typeof missingWouldBeUnfounded>[3];

const raison = async (reason: StopReason, seenCount = 5) =>
  missingWouldBeUnfounded('source', seenCount, reason, vide);

describe('ce qui interdit de conclure à une absence', () => {
  it('une liste vide affichée par la source en autorise une', async () => {
    // Une agence qui n'a plus rien en ligne le dit : c'est le seul cas où
    // l'absence est une information.
    expect(await raison('empty')).toBeNull();
  });

  it('une lecture complète en autorise une', async () => {
    expect(await raison('completed')).toBeNull();
  });

  it.each<StopReason>([
    'notModified',
    'incomplete',
    'knownTerritory',
    'maxPages',
    'maxListings',
    'rateLimited',
    'blocked',
    'tooManyErrors',
  ])('un arrêt sur « %s » ne conclut rien', async (reason) => {
    expect(await raison(reason)).not.toBeNull();
  });

  it('« knownTerritory » est un arrêt, PAS une lecture complète', async () => {
    // C'EST LE TEST DU BUG. La source s'arrête voluntarily dès qu'elle retombe
    // sur du stock déjà collecté : c'est sans danger pour les annonces, mais on
    // n'a pas vu la fin de la liste. Pris pour une lecture complète, le pipeline
    // concluait que tout ce qui manquait avait disparu.
    // Relevé du 2026-09-25 sur LocService : 47 annonces rendues pour 798
    // connues, au lieu de 723 — et pas une seule annonce éteinte en 71 passages.
    const verdict = await missingWouldBeUnfounded('locservice', 47, 'knownTerritory', {
      activeOccurrenceCount: () => Promise.resolve(798),
    } as unknown as Parameters<typeof missingWouldBeUnfounded>[3]);
    expect(verdict?.code).toBe('blind');
  });

  it('un plafond de pages n’est pas une liste épuisée', async () => {
    // `MAX_PAGES` atteint signifie « il en reste », pas « il n’en reste plus ».
    const verdict = await missingWouldBeUnfounded('source', 47, 'maxPages', {
      activeOccurrenceCount: () => Promise.resolve(798),
    } as unknown as Parameters<typeof missingWouldBeUnfounded>[3]);
    expect(verdict?.code).toBe('blind');
  });

  it('signale une source vide qui ne le déclare pas', async () => {
    // Ni conclusion ni silence : c'est un gabarit qui a changé, et ça s'alerte.
    const verdict = await raison('completed', 0);
    expect(verdict?.code).toBe('emptyWithoutSign');
  });

  it('reproche une chute réelle, quand le passage était complet', async () => {
    // La chute reste détectable : c'est le passage complet qui autorise à y
    // croire. Une fois les arrêts précités classés « aveugles », ce cas reste
    // le seul qui déclenche l'effondrement.
    const verdict = await missingWouldBeUnfounded('source', 47, 'completed', {
      activeOccurrenceCount: () => Promise.resolve(798),
    } as unknown as Parameters<typeof missingWouldBeUnfounded>[3]);
    expect(verdict?.code).toBe('collapse');
  });
});
