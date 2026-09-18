/**
 * La version HTML de l'alerte e-mail, aux couleurs de l'application.
 *
 * ÉCRITE POUR LES MESSAGERIES, PAS POUR UN NAVIGATEUR : tableaux, styles en
 * ligne, aucune feuille externe ni script — Gmail et Outlook retirent le reste.
 * Le texte brut part toujours avec : c'est lui qu'affiche une messagerie qui
 * refuse le HTML.
 *
 * Les photos restent chez leur site d'origine (§11) : le message les référence,
 * il ne les embarque pas.
 */

import { formatRent, listingUrl } from '@maioun/shared';
import type { NotifiableListing } from '../db/repository.js';
import {
  EMAIL_COLORS,
  EMAIL_FONT as FONT,
  emailDocument,
  escapeHtml as escape,
} from './email-theme.js';

const {
  primary: PRIMARY,
  foreground: FOREGROUND,
  muted: MUTED,
  border: BORDER,
  background: BACKGROUND,
} = EMAIL_COLORS;

/** « nice » → « Nice », « beaulieu sur mer » → « Beaulieu Sur Mer ». */
function titleCase(value: string): string {
  return value.replace(
    /(^|[\s-])(\p{L})/gu,
    (_m, sep: string, letter: string) => sep + letter.toUpperCase(),
  );
}

/** « 5 sept. » — le jour tel qu'écrit, sans décalage de fuseau. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Comme l'application : loyer arrondi, surface à une décimale, virgule française. */
function figures(listing: NotifiableListing): string {
  const area = listing.area === null ? null : Math.round(listing.area * 10) / 10;
  return [
    area === null ? null : `${String(area).replace('.', ',')}&nbsp;m²`,
    listing.rooms === null ? null : `${listing.rooms}&nbsp;pièce${listing.rooms > 1 ? 's' : ''}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

function card(listing: NotifiableListing, siteUrl: string, nowMs: number): string {
  const url = escape(listingUrl(siteUrl, listing.id));
  const photo = listing.photoUrls.find((photoUrl) => photoUrl.startsWith('https://'));
  const place = listing.address ?? listing.district ?? listing.city;
  const available =
    listing.availableAt === null
      ? null
      : Date.parse(listing.availableAt) <= nowMs
        ? 'Disponible maintenant'
        : `Disponible le ${shortDate(listing.availableAt)}`;
  const details = figures(listing);

  const lines = [
    `<div style="font-size:22px;font-weight:700;color:${FOREGROUND};line-height:1.2">${
      listing.price === null ? 'Loyer N/A' : formatRent(listing.price).replace(' €', '&nbsp;€')
    }</div>`,
    details === ''
      ? null
      : `<div style="margin-top:2px;font-size:14px;color:${MUTED}">${details}</div>`,
    `<div style="margin-top:4px;font-size:15px;font-weight:600;color:${FOREGROUND};line-height:1.35">${escape(
      listing.title ?? 'Annonce',
    )}</div>`,
    place === null
      ? null
      : `<div style="margin-top:6px;font-size:13px;color:${MUTED}">📍 ${escape(titleCase(place))}</div>`,
    available === null
      ? null
      : `<div style="margin-top:2px;font-size:13px;color:${MUTED}">📅 ${available}</div>`,
    listing.phone === null
      ? null
      : `<div style="margin-top:2px;font-size:13px"><a href="tel:${escape(listing.phone)}" style="color:${PRIMARY};text-decoration:none;font-weight:600">📞 ${escape(listing.phone)}</a></div>`,
    `<div style="margin-top:12px"><a href="${url}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:9px 16px;border-radius:8px">Voir l’annonce</a></div>`,
  ].filter((line): line is string => line !== null);

  const photoCell =
    photo === undefined
      ? ''
      : // Le fond gris tient la place d'une photo que le site d'origine ne sert plus.
        `<td width="136" valign="top" style="padding:0 16px 0 0"><a href="${url}"><img src="${escape(
          photo,
        )}" width="136" alt="" style="display:block;width:136px;height:auto;min-height:102px;background:${BACKGROUND};border-radius:8px;border:0"></a></td>`;

  return `<tr><td style="padding:0 0 12px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px">
<tr><td style="padding:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${photoCell}<td valign="top" style="font-family:${FONT}">${lines.join('')}</td>
</tr></table></td></tr></table>
</td></tr>`;
}

/** Le message complet. `rest` : les annonces comptées sans être détaillées. */
export function alertEmailHtml(deps: {
  readonly heading: string;
  readonly listings: readonly NotifiableListing[];
  readonly rest: number;
  readonly siteUrl: string;
  readonly nowMs: number;
}): string {
  const { heading, listings, rest, siteUrl, nowMs } = deps;
  const total = listings.length + rest;
  const count = `${total} annonce${total > 1 ? 's' : ''} correspond${total > 1 ? 'ent' : ''} à votre recherche`;
  const site = escape(siteUrl);

  return emailDocument({
    title: heading,
    preheader: count,
    rows: `<tr><td style="padding:0 4px 16px 4px">
<div style="font-size:24px;font-weight:700;color:${FOREGROUND}">${escape(heading)}</div>
<div style="margin-top:4px;font-size:14px;color:${MUTED}">${escape(count)}</div>
</td></tr>
${listings.map((listing) => card(listing, siteUrl, nowMs)).join('\n')}
<tr><td align="center" style="padding:8px 0 0 0">
${rest > 0 ? `<div style="font-size:14px;color:${MUTED};margin-bottom:10px">… et ${rest} autre${rest > 1 ? 's' : ''} annonce${rest > 1 ? 's' : ''}</div>` : ''}
<a href="${site}" style="display:inline-block;background:#ffffff;color:${FOREGROUND};border:1px solid ${BORDER};text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Tout voir sur Maïoun</a>
</td></tr>
<tr><td align="center" style="padding:24px 4px 0 4px;font-size:12px;color:${MUTED};line-height:1.5">
Pour ne plus recevoir ces alertes : <a href="${site}" style="color:${MUTED}">Paramètres → Notifications</a>.
</td></tr>`,
  });
}
