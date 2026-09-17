/**
 * L'AGENCE NOMMÉE PAR UNE ALERTE FAIT RELIRE SON CATALOGUE.
 *
 * Une annonce vue par e-mail est pauvre : ni adresse, ni téléphone, ni décompte
 * de charges, ni DPE — le digest n'en écrit rien. La même annonce, chez
 * l'agence, les porte toutes. Relevé sur les quarante-sept annonces d'alerte
 * déjà rapprochées d'une source directe : la fiche de l'agence apportait les
 * charges trente-quatre fois, un téléphone trente-trois fois, le DPE vingt fois
 * et l'adresse dix-neuf fois.
 *
 * ET L'E-MAIL ARRIVE AVANT NOUS : sur ces mêmes paires, l'alerte précède de sept
 * heures (médiane) le passage programmé chez l'agence, trente et une fois sur
 * quarante-sept. Faire passer ce catalogue en tête de la file suivante, c'est
 * gagner ces heures-là.
 *
 * CE MODULE NE DÉCIDE NI NE REQUÊTE : il retient le NOM écrit par le message
 * dans le repère de la source, et le rend au cœur, qui le rapproche de ses
 * sources et en avance le tour. Pas de requête hors cadence, pas de budget
 * contourné : une alerte ne justifie pas de marteler une agence.
 *
 * ON N'INVENTE JAMAIS UN NOM : une annonce dont le message ne nomme pas
 * l'annonceur ne réveille personne, et un nom qu'aucune source ne porte reste
 * sans suite.
 */

import type { RawListing } from '@maioun/shared';
import { comparable } from '../../normalization/text.js';
import { createAgencySourceResolver, type AgencyHandle } from '../agency-names.js';

/** Une agence nommée par un message, et l'instant où elle l'a été. */
export interface AwaitedAgency {
  readonly name: string;
  readonly since: string;
}

/**
 * Au-delà de douze heures, une attente ne vaut plus rien : soit le catalogue a
 * été relu entre-temps, soit l'agence est hors d'atteinte et insister ne
 * changera rien.
 */
const AWAIT_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Nombre d'agences attendues gardées de front.
 *
 * Dix, et c'est large : sur vingt et un jours de boîte, les messages qui nomment
 * leur agence arrivent au rythme d'un par jour. Le plafond n'est là que pour
 * qu'un envoi en rafale ne prenne pas la file entière.
 */
const AWAIT_LIMIT = 10;

/** Relit la liste d'agences d'un repère ; vide dès qu'elle n'a pas la forme attendue. */
export function parseAwaitedAgencies(memo: string | null | undefined): readonly AwaitedAgency[] {
  if (memo === null || memo === undefined || memo.trim() === '') return [];
  let value: unknown;
  try {
    value = JSON.parse(memo);
  } catch {
    return [];
  }
  if (typeof value !== 'object' || value === null) return [];
  const raw = (value as { agencies?: unknown }).agencies;
  if (!Array.isArray(raw)) return [];

  const awaited: AwaitedAgency[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { name, since } = entry as Partial<AwaitedAgency>;
    if (typeof name !== 'string' || name.trim() === '') continue;
    if (typeof since !== 'string' || !Number.isFinite(Date.parse(since))) continue;
    awaited.push({ name, since });
  }
  return awaited;
}

/**
 * Les agences attendues après ce passage : celles que le message vient de
 * nommer, et celles d'avant qui n'ont pas encore vieilli.
 *
 * LES PRÉCÉDENTES SONT GARDÉES parce que le cœur, lui, saura si le catalogue a
 * déjà été relu — il compare la date du passage à celle de l'alerte. Les
 * effacer ici perdrait une attente dès qu'un passage de collecte est écourté.
 */
export function awaitedAgenciesAfter(
  previous: readonly AwaitedAgency[],
  listings: readonly RawListing[],
  nowMs: number,
): readonly AwaitedAgency[] {
  const now = new Date(nowMs).toISOString();
  const fresh = listings
    .map((listing) => listing.agencyName)
    .filter((name): name is string => name !== undefined && name.trim() !== '')
    .map((name) => ({ name, since: now }));

  // La plus récente l'emporte sur ses homonymes : c'est elle qui dit jusqu'à
  // quand l'attente court.
  const byName = new Map<string, AwaitedAgency>();
  for (const agency of [...previous, ...fresh]) {
    if (Date.parse(agency.since) < nowMs - AWAIT_WINDOW_MS) continue;
    const key = comparable(agency.name);
    if (key === '') continue;
    const known = byName.get(key);
    if (known === undefined || Date.parse(known.since) <= Date.parse(agency.since)) {
      byName.set(key, agency);
    }
  }

  return [...byName.values()]
    .sort((a, b) => Date.parse(b.since) - Date.parse(a.since))
    .slice(0, AWAIT_LIMIT);
}

/**
 * Les sources dont le catalogue est attendu, et depuis quand.
 *
 * L'INSTANT COMPTE AUTANT QUE LA SOURCE : c'est lui qui dit à l'ordonnanceur
 * quand l'attente est satisfaite — un catalogue relu APRÈS l'alerte n'a plus
 * rien à rattraper. Sans cette date, la même agence repasserait en tête à chaque
 * cycle tant que le repère la cite, ce qui reviendrait à la marteler.
 */
export function awaitedSources(
  memo: string | null | undefined,
  sources: readonly AgencyHandle[],
  nowMs: number,
): ReadonlyMap<string, string> {
  const resolver = createAgencySourceResolver(sources);
  const expected = new Map<string, string>();
  for (const agency of parseAwaitedAgencies(memo)) {
    if (Date.parse(agency.since) < nowMs - AWAIT_WINDOW_MS) continue;
    const sourceId = resolver.resolve(agency.name);
    // Aucune source, ou deux : on ne réveille personne plutôt que la mauvaise.
    if (sourceId === null) continue;
    const known = expected.get(sourceId);
    if (known === undefined || Date.parse(known) < Date.parse(agency.since)) {
      expected.set(sourceId, agency.since);
    }
  }
  return expected;
}
