/**
 * CE QU'ON NE CHARGE QU'EN ARRIVANT DESSUS (§30).
 *
 * Quatre écrans — l'annuaire des agences, la fiche d'une agence, l'historique
 * des alertes, les démarches — demandent chacun une lecture que la liste ne
 * transporte pas, et qu'une majorité de sessions n'ouvre jamais. Les charger
 * d'avance, c'est faire payer à tout le monde ce dont presque personne ne se
 * sert.
 *
 * RÉUNIS ICI PARCE QU'ILS OBÉISSENT À LA MÊME RÈGLE, et qu'ils vivaient
 * dispersés dans `App` : quatre `useState` en haut, quatre `useEffect` cinq
 * cents lignes plus bas. Rien ne disait qu'ils allaient par paires, et ajouter
 * un cinquième écran demandait de retrouver le motif au milieu du reste.
 *
 * UN ÉCHEC N'EST PAS UNE PAGE VIDE SILENCIEUSE : chacun dit ce qui n'a pas pu
 * être chargé. L'historique et les démarches font exception — ils se taisent,
 * parce qu'un compte neuf n'a légitimement rien à y montrer et qu'une erreur y
 * serait indiscernable du cas normal.
 */

import { useEffect, useState } from 'react';
import type { ListingView } from './types.js';
import {
  fetchAgencies,
  fetchAgency,
  fetchAlerts,
  fetchExchanges,
  type AgencySummary,
  type ExchangeView,
} from './api/client.js';
import type { View } from './router.js';

/** Une agence et les annonces qu'elle publie. */
export interface AgencyDetail {
  readonly agency: AgencySummary;
  readonly listings: readonly ListingView[];
}

export interface ScreenDataParams {
  readonly view: View;
  /** Le nom de l'agence ouverte, porté par l'adresse. */
  readonly agencyName: string | null;
  /** `undefined` tant qu'on ne sait pas qui regarde, `null` pour un visiteur. */
  readonly currentUser: string | null | undefined;
  readonly onError: (message: string) => void;
}

export interface ScreenData {
  readonly agencies: readonly AgencySummary[];
  readonly agencyDetail: AgencyDetail | null;
  readonly alerts: readonly ListingView[];
  readonly exchanges: readonly ExchangeView[];
}

/** Est-on connecté, pour de bon — et non « on ne sait pas encore » ? */
function connecte(currentUser: string | null | undefined): boolean {
  return currentUser !== null && currentUser !== undefined;
}

export function useScreenData({
  view,
  agencyName,
  currentUser,
  onError,
}: ScreenDataParams): ScreenData {
  const [agencies, setAgencies] = useState<readonly AgencySummary[]>([]);
  const [agencyDetail, setAgencyDetail] = useState<AgencyDetail | null>(null);
  const [alerts, setAlerts] = useState<readonly ListingView[]>([]);
  const [exchanges, setExchanges] = useState<readonly ExchangeView[]>([]);

  useEffect(() => {
    if (view !== 'agencies') return;
    void fetchAgencies()
      .then(setAgencies)
      .catch(() => onError('L’annuaire des agences n’a pas pu être chargé'));
  }, [view]);

  useEffect(() => {
    if (view !== 'agency' || agencyName === null) return;
    // Remis à zéro d'abord : sans cela, ouvrir une deuxième agence afficherait
    // les annonces de la première le temps de la requête.
    setAgencyDetail(null);
    void fetchAgency(agencyName)
      .then(setAgencyDetail)
      .catch(() => onError('Cette agence n’a pas pu être chargée'));
  }, [view, agencyName]);

  useEffect(() => {
    if (view !== 'alerts' || !connecte(currentUser)) return;
    void fetchAlerts()
      .then(setAlerts)
      .catch(() => undefined);
  }, [view, currentUser]);

  useEffect(() => {
    if (view !== 'exchanges' || !connecte(currentUser)) return;
    void fetchExchanges()
      .then(setExchanges)
      .catch(() => undefined);
  }, [view, currentUser]);

  return { agencies, agencyDetail, alerts, exchanges };
}
