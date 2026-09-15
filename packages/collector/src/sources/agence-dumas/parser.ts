/**
 * Source : Agence Dumas (agencedumas.fr) — WordPress, thème maison, rendu
 * serveur.
 *
 * `/locations-annuelles/` liste toutes les locations à l'année en cartes
 * `a.proprety-item` (identifiant WordPress en `data-id`, ville, loyer, surface).
 * La fiche `/p/…/` donne titre, loyer mensuel, tableau « Détails » (référence,
 * pièces, chambres), photos du carrousel, DPE/GES en image, et une description
 * où l'agence écrit provision de charges, dépôt, honoraires et disponibilité.
 * Les locations saisonnières vivent sur un autre sous-domaine, jamais lu.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Agence Dumas';
export const LIST_URL = 'https://www.agencedumas.fr/locations-annuelles/';

const FICHE = /^https:\/\/www\.agencedumas\.fr\/p\/[\w%-]+\/$/;

/** « disponible à partir du 2 octobre 2026 » ou « Disponibilité : 16 septembre 2026 ». */
const AVAILABLE = /(?:disponible à partir du|disponibilité\s*:)\s*([^.\n]+)/i;

/** « 1 850 € » suivi de « / Mois » : seul un loyer mensuel est retenu. */
function monthlyPrice(amount: string, block: string): string | undefined {
  return /\d/.test(amount) && /\/\s*mois/i.test(block) ? `${cleanText(amount)} / mois` : undefined;
}

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('#post-list a.proprety-item').each((_i, el) => {
    const card = $(el);
    const sourceUrl = card.attr('href') ?? '';
    const reference = card.find('[data-id]').first().attr('data-id');
    if (reference === undefined || !/^\d+$/.test(reference) || !FICHE.test(sourceUrl)) return;
    if (byRef.has(reference)) return;
    // Première ligne du bloc détails : le titre, parfois vide.
    const details = card.find('.details .col-10').first();
    const title = cleanText(details.contents().first().text());
    const price = card.find('.price').first();
    const area = /(\d+(?:[.,]\d+)?)\s*m/.exec(cleanText(details.text()))?.[1];
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: title === '' ? undefined : title,
        priceText: monthlyPrice(price.find('.price-number').text(), price.text()),
        areaText: area !== undefined ? `${area} m²` : undefined,
        cityText: cleanText(card.find('h3').first().text()) || undefined,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/**
 * Le site n'affiche aucun message quand rien ne correspond : il rend le
 * conteneur `#post-list` sans aucun élément. Une carte au balisage changé
 * resterait un élément, et la liste ne passerait donc pas pour vide.
 */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  const list = $('#post-list');
  return list.length === 1 && list.children().length === 0;
}

/** Lettre de l'étiquette énergie : `energy/A.png` (DPE), `energy/2_A.png` (GES). */
function energyLetter($: cheerio.CheerioAPI, prefix: '' | '2_'): string | undefined {
  const pattern = new RegExp(`/energy/${prefix}([A-G])\\.png$`);
  for (const img of $('img[src*="/energy/"]').toArray()) {
    const letter = pattern.exec($(img).attr('src') ?? '')?.[1];
    if (letter !== undefined) return letter;
  }
  return undefined;
}

/** Somme des montants d'honoraires (visite/dossier/bail + état des lieux). */
function feesTotal(description: string): string | undefined {
  const amounts = [...description.matchAll(/Honoraires[^€]*?(\d[\d\s]*(?:,\d+)?)\s*€/gi)].map(
    (match) => Number((match[1] ?? '').replace(/\s/g, '').replace(',', '.')),
  );
  if (amounts.length === 0 || amounts.some((n) => !Number.isFinite(n))) return undefined;
  const total = Math.round(amounts.reduce((sum, n) => sum + n, 0) * 100) / 100;
  return `${String(total).replace('.', ',')} €`;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const heading = $('.row.heading').first();
  const price = heading.find('.price').first();
  const priceText = monthlyPrice(price.find('.price-number').text(), price.text());
  if (priceText === undefined) return null;

  const details = new Map<string, string>();
  $('.details .list .row').each((_i, el) => {
    const cols = $(el).children('.col');
    if (cols.length !== 2) return;
    const label = cleanText(cols.first().text()).toLowerCase();
    const value = cleanText(cols.last().text());
    if (label !== '' && value !== '') details.set(label, value);
  });

  const title = cleanText(heading.find('.title').first().text());
  const description = htmlToText($, '.row.align-items-stretch > .col-12');
  const area = $('.service-item h3')
    .toArray()
    .map((h3) => cleanText($(h3).text()))
    .find((text) => /^\d+(?:[.,]\d+)?\s*m\s*2$/i.test(text));
  const rooms = details.get('pièce(s)');
  const imageUrls = [
    ...new Set(
      $('#owl-carousel-single .proprety-img')
        .toArray()
        .map((div) => /url\(([^)]+)\)/.exec($(div).attr('style') ?? '')?.[1] ?? '')
        .filter((url) => /^https:\/\/www\.agencedumas\.fr\/wp-content\/uploads\//.test(url)),
    ),
  ];

  const extra: Record<string, string> = {};
  const reference = details.get('référence');
  if (reference !== undefined) extra['reference'] = reference;
  const dpe = energyLetter($, '');
  if (dpe !== undefined) extra['dpe'] = dpe;
  const ges = energyLetter($, '2_');
  if (ges !== undefined) extra['ges'] = ges;
  const features = [...details]
    .filter(([label]) => label !== 'référence')
    .map(([label, value]) => `${label} : ${value}`);
  if (features.length > 0) extra['features'] = features.join(' · ');

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: /charges comprises/i.test(description) ? `${priceText} CC` : priceText,
    chargesText: afterLabel(description, String.raw`provision (?:mensuelle )?(?:pour|sur) charges`),
    depositText: afterLabel(description, String.raw`Dépôt de garantie`, AMOUNT),
    feesText: feesTotal(description),
    areaText: area?.replace(/m\s*2$/i, 'm²'),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    // Sans titre, l'accroche de la description nomme le bien (« charmante maison de pêcheur »).
    propertyTypeText: title !== '' ? title : description.split('\n')[0] || undefined,
    furnishedText: `${title} ${description}`,
    cityText: cleanText($('h2.city').first().text()) || undefined,
    availableAtText: AVAILABLE.exec(description)?.[1]?.trim(),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
