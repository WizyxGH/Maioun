/**
 * LES ALERTES PAR E-MAIL (§29).
 *
 * EN PLUS DU PUSH, PAS À SA PLACE : le push suppose un navigateur qui
 * l'accepte, un appareil allumé, et une notification qu'on n'a pas balayée.
 * L'e-mail arrive partout, se retrouve et se transfère.
 *
 * UN SEUL MESSAGE PAR PASSAGE, et c'est la différence de fond avec le push :
 * huit e-mails en dix minutes sont du courrier indésirable, et c'est ainsi
 * qu'on se fait ranger dans le dossier qui va avec — après quoi plus rien
 * n'arrive. En texte brut, ce qui se lit partout.
 *
 * Sans clé d'API ni expéditeur, on ne prétend pas avoir envoyé : le rapport le
 * déclare (§17), comme le push sans clés VAPID.
 */

import type { NotifiableListing } from '../db/repository.js';
import type { Logger } from '../core/logger.js';
import { mailerConfigured, sendEmail, type MailerEnv } from './mailer.js';

/** Au-delà, le message devient une liste qu'on ne lit plus. Le reste est résumé. */
const MAX_DETAILED = 8;

export interface EmailAlertDeps {
  readonly mailer: MailerEnv;
  /** Destinataire — une adresse VÉRIFIÉE, jamais une adresse seulement saisie. */
  readonly to: string;
  readonly listings: readonly NotifiableListing[];
  readonly siteUrl: string;
  readonly logger: Logger;
  /** Ce que le message annonce, selon la famille d'alerte. */
  readonly heading: string;
}

export interface EmailAlertReport {
  /** Les annonces effectivement portées par un message parti. */
  readonly notifiedIds: readonly string[];
  /** `true` si l'envoi n'est pas configuré : rien n'est parti, et ce n'est pas une panne. */
  readonly unconfigured: boolean;
}

const EMPTY: EmailAlertReport = { notifiedIds: [], unconfigured: false };

/** « 690 € · 32 m² · 2 pièces » — ce qui manque est simplement absent (§17). */
function summarize(listing: NotifiableListing): string {
  const parts = [
    listing.price === null ? null : `${listing.price} €`,
    listing.area === null ? null : `${listing.area} m²`,
    listing.rooms === null ? null : `${listing.rooms} pièce${listing.rooms > 1 ? 's' : ''}`,
  ].filter((part): part is string => part !== null);
  return parts.join(' · ');
}

/** Le lieu tel qu'on peut l'annoncer : la rue si on l'a, sinon le quartier. */
function place(listing: NotifiableListing): string | null {
  return listing.address ?? listing.district ?? listing.city ?? null;
}

/** Le bloc d'une annonce : titre, chiffres, lieu, téléphone, lien. */
function block(listing: NotifiableListing, siteUrl: string): string {
  const lines = [
    `▸ ${listing.title ?? 'Annonce'}`,
    `  ${summarize(listing)}`,
    place(listing) === null ? null : `  📍 ${place(listing)}`,
    // Le téléphone est ce qui fait gagner l'annonce : appeler passe avant
    // d'écrire, et il n'est pas toujours sur la fiche du site.
    listing.phone === null ? null : `  ☎ ${listing.phone}`,
    `  ${siteUrl.replace(/\/$/, '')}/listing/${encodeURIComponent(listing.id)}`,
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

/**
 * Compose le corps du message. Exporté POUR ÊTRE TESTÉ sans rien envoyer.
 *
 * Les annonces arrivent triées par priorité : on détaille les premières et on
 * compte les autres, plutôt que de rendre un message qu'on abandonne au tiers.
 */
export function composeAlertEmail(deps: {
  readonly listings: readonly NotifiableListing[];
  readonly siteUrl: string;
  readonly heading: string;
}): { subject: string; text: string } {
  const { listings, siteUrl, heading } = deps;
  const detailed = listings.slice(0, MAX_DETAILED);
  const rest = listings.length - detailed.length;

  const subject =
    listings.length === 1
      ? `${heading} : ${listings[0]?.title ?? 'une annonce'}`
      : `${heading} : ${listings.length} annonces`;

  const text = [
    heading,
    '',
    detailed.map((listing) => block(listing, siteUrl)).join('\n\n'),
    rest > 0 ? `\n… et ${rest} autre${rest > 1 ? 's' : ''} annonce${rest > 1 ? 's' : ''}.` : null,
    '',
    `Tout voir : ${siteUrl}`,
    '',
    // OÙ COUPER, DIT DANS LE MESSAGE. Un e-mail d'alerte sans porte de sortie
    // se signale comme indésirable — c'est le réflexe, et il coûte le canal.
    'Pour ne plus recevoir ces alertes : Paramètres → Notifications.',
  ]
    .filter((part): part is string => part !== null)
    .join('\n');

  return { subject, text };
}

/**
 * Envoie une alerte groupée. Ne lève jamais : une panne du fournisseur ne doit
 * pas interrompre une collecte (§69).
 */
export async function sendEmailAlert(deps: EmailAlertDeps): Promise<EmailAlertReport> {
  const { mailer, to, listings, siteUrl, logger, heading } = deps;
  if (listings.length === 0) return EMPTY;

  if (!mailerConfigured(mailer)) {
    logger.debug('email.unconfigured', { pending: listings.length });
    return { notifiedIds: [], unconfigured: true };
  }

  const { subject, text } = composeAlertEmail({ listings, siteUrl, heading });
  const sent = await sendEmail(mailer, { to, subject, text });

  if (!sent) {
    logger.warn('email.failed', { count: listings.length });
    return EMPTY;
  }

  logger.info('email.sent', { count: listings.length });
  // Les identifiants ne sont rendus QU'EN CAS DE SUCCÈS : c'est ce qui décide
  // de marquer les annonces comme signalées. Les rendre sur un échec les
  // ferait taire à jamais, sans que personne ne les ait reçues.
  return { notifiedIds: listings.map((listing) => listing.id), unconfigured: false };
}
