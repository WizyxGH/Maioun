/**
 * CE QUE LA LOI PLAFONNE — honoraires d'agence et dépôt de garantie.
 *
 * Deux montants que les annonces publient, que personne ne vérifie, et qui se
 * comparent à un plafond ÉCRIT : ce ne sont pas des impressions, ce sont des
 * règles. Mesuré le 2026-09-22 sur l'inventaire : 548 annonces sur les 1 627
 * qui publient des honoraires avec une surface dépassent le plafond niçois,
 * pour 138 000 € cumulés au-dessus. Un cas vérifié de bout en bout : une
 * chambre de 15 m² louée 720 €, dont le texte annonce « (hono 720) » — soit
 * 3,7 fois le plafond.
 *
 * CE MODULE CALCULE, IL N'ACCUSE PAS. Il rend un plafond ou `null` ; ce que
 * l'interface en dit est son affaire. Un plafond dépassé peut signer une
 * infraction comme une donnée mal lue — l'écart se MONTRE, il ne se conclut
 * pas.
 *
 * `null` DÈS QU'UN ÉLÉMENT MANQUE, et jamais une estimation : sans surface
 * habitable il n'y a pas de plafond d'honoraires, et sans loyer hors charges
 * établi il n'y a pas de plafond de dépôt (§17).
 */

import type { Maybe } from './provenance.js';
import { rentExcludingCharges, type RentBasis } from './listing.js';

/**
 * Honoraires à la charge du LOCATAIRE, par m² de surface habitable.
 *
 * Décret n° 2014-890 du 1er août 2014, pris pour la loi ALUR : 12 €/m² en zone
 * très tendue, 10 €/m² en zone tendue, 8 €/m² ailleurs, plus 3 €/m² pour
 * l'état des lieux. Les plafonds sont indexés ; valeurs au 1er janvier 2026.
 *
 * NICE EST EN ZONE TENDUE, PAS TRÈS TENDUE. La zone très tendue est la zone
 * A bis du code de la construction — l'agglomération parisienne. Nice relève
 * du décret n° 2013-392 du 10 mai 2013, qui liste les communes en zone
 * tendue. Se tromper de zone donnerait deux euros du mètre carré de marge à
 * tort, soit une trentaine d'euros sur un studio.
 */
export const TENANT_FEE_CAP_PER_SQM_TIGHT = 10.09;
/** État des lieux, plafonné à part par le même décret (art. 2). */
export const INVENTORY_FEE_CAP_PER_SQM = 3;

/**
 * Le plafond légal des honoraires locataire pour une surface donnée, à Nice.
 *
 * Il additionne les deux postes plafonnés — visite/dossier/bail et état des
 * lieux — parce que c'est ce qu'une annonce agrège sous le mot « honoraires ».
 * Le comparer au seul premier poste ferait dépasser des agences en règle.
 */
export function legalTenantFeeCap(areaSqm: Maybe<number>): Maybe<number> {
  if (areaSqm === null || !Number.isFinite(areaSqm) || areaSqm <= 0) return null;
  return areaSqm * (TENANT_FEE_CAP_PER_SQM_TIGHT + INVENTORY_FEE_CAP_PER_SQM);
}

/**
 * Le plafond légal du dépôt de garantie.
 *
 * Loi du 6 juillet 1989 : un mois de loyer HORS CHARGES pour un logement vide
 * (art. 22), deux mois pour un meublé (art. 25-6).
 *
 * MEUBLÉ INCONNU : PAS DE PLAFOND. Retenir un mois par défaut ferait dépasser
 * tous les meublés en règle, et retenir deux mois laisserait passer les vides
 * abusifs. Un trait inconnu ne conclut rien (§17).
 */
export function legalDepositCap(basis: RentBasis, furnished: Maybe<boolean>): Maybe<number> {
  if (furnished === null) return null;
  const rent = rentExcludingCharges(basis);
  if (rent === null) return null;
  return furnished ? rent * 2 : rent;
}

/**
 * De combien un montant dépasse son plafond, ou `null` s'il le respecte.
 *
 * LA TOLÉRANCE EST PROPORTIONNELLE, et une marge fixe ne suffisait pas.
 * Les plafonds ne sont pas des nombres ronds : celui des honoraires tombe sur
 * des centimes (10,09 €/m²), celui du dépôt se calcule à partir d'un loyer
 * hors charges lui-même déduit. Relevé du 2026-09-22 sur les dépôts signalés :
 * sur quatre cas examinés, deux dépassaient de 5 € et de 10 € — 0,3 % d'un
 * dépôt de trois mille euros, c'est-à-dire un arrondi d'agence, pas un abus.
 * Les deux autres dépassaient de 100 € et 300 €, soit 5 et 13 %.
 *
 * Deux pour cent départagent donc les deux, et le plancher d'un euro garde son
 * utilité sur les petits montants.
 */
const ROUNDING_TOLERANCE_EUR = 1;
const ROUNDING_TOLERANCE_RATIO = 0.02;

export function amountOverCap(amount: Maybe<number>, cap: Maybe<number>): Maybe<number> {
  if (amount === null || cap === null) return null;
  const tolerance = Math.max(ROUNDING_TOLERANCE_EUR, cap * ROUNDING_TOLERANCE_RATIO);
  const over = amount - cap;
  return over > tolerance ? over : null;
}
