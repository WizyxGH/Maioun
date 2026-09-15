/**
 * Pourquoi une annonce est rangée avec les archivées.
 *
 * L'API le dit (`archiveReason`) ; les données de démonstration et une fiche
 * restée en mémoire d'avant ne le disent pas, d'où la même règle recalculée.
 */

import type { ArchiveReason, ListingView } from './types.js';

type Availability = Pick<ListingView, 'archived' | 'rented' | 'lifecycle' | 'applicationStatus'>;

export function archiveReasonOf(listing: Availability): ArchiveReason | null {
  if (listing.rented === true) return 'rented';
  if (listing.lifecycle === 'inactive') return 'offline';
  if (listing.applicationStatus === 'full') return 'applicationsFull';
  // `archived` et non la raison reçue : un désarchivage se voit avant le rechargement.
  return listing.archived === true ? 'user' : null;
}

/** Louée ou retirée d'après sa source : plus rien à tenter. */
export function isUnavailable(listing: Availability): boolean {
  const reason = archiveReasonOf(listing);
  return reason === 'rented' || reason === 'offline';
}

/** Archivée d'office : la désarchiver n'aurait aucun effet. */
export function isArchivedBySource(listing: Availability): boolean {
  const reason = archiveReasonOf(listing);
  return reason !== null && reason !== 'user';
}
