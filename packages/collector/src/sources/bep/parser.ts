/**
 * Parser BEP Logement — l'adaptateur générique Apimo (§47), plus la référence
 * que BEP est seule à écrire.
 *
 * BEP a été la première agence de cette plateforme ; son parser a depuis été
 * généralisé dans `sources/apimo/parser.ts`, désormais partagé avec les autres
 * agences Apimo. Ce module conserve l'API historique (et son `defaultAgencyName`
 * propre) pour les tests de BEP.
 */

import type { RawListing } from '@maioun/shared';
import { parseDetailPage as apimoParseDetailPage, type ParsedDetail } from '../apimo/parser.js';

export {
  parseListingUrl,
  parseSitemap,
  parseSitemapIndex,
  type ParsedListingUrl,
  type SitemapEntry,
  type ParsedDetail,
} from '../apimo/parser.js';

/**
 * LA RÉFÉRENCE QUE BEP DONNE AU TÉLÉPHONE, et qu'elle écrit en fin de
 * descriptif : « Référence de l'annonce : 0603716 ».
 *
 * Le gabarit Apimo la publie normalement en critère, ligne à part, et c'est là
 * que l'adaptateur générique va la chercher. BEP ne remplit pas ce critère : la
 * référence n'existe que dans le texte libre. Résultat, aucune fiche BEP
 * relue depuis le retrait du repli n'en portait plus — et les cent deux qui en
 * affichaient encore une montraient l'identifiant d'URL Apimo, un numéro
 * fabriqué que l'agence ne reconnaît pas quand on le lui cite. Relevé le
 * 2026-09-17 : les cent treize fiches BEP en base publient cette ligne.
 *
 * L'apostrophe s'écrit droite ou courbe selon les fiches ; « n° » précède
 * parfois le numéro. On ne retient qu'une valeur d'au moins trois caractères :
 * en deçà, ce n'est pas une référence mais la fin d'une phrase.
 */
const PUBLISHED_REFERENCE =
  /r[ée]f[ée]rence\s+de\s+l['’’]\s*annonce\s*:?\s*(?:n\s*[°o]\s*)?([A-Za-z0-9][A-Za-z0-9._/-]{2,})/i;

/** La référence imprimée par BEP dans un descriptif, si elle y est. */
export function publishedReference(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  return PUBLISHED_REFERENCE.exec(description)?.[1];
}

/**
 * Analyse une fiche BEP (agence par défaut : « BEP Logement »).
 *
 * La référence lue dans le descriptif ne prend jamais la place de celle que le
 * gabarit publierait en critère : celle-là est structurée, celle-ci est un
 * repêchage dans du texte libre, donc moins sûre.
 */
export function parseDetailPage(html: string, pageUrl: string): ParsedDetail {
  const parsed = apimoParseDetailPage(html, pageUrl, 'BEP Logement');
  const listing: RawListing | null = parsed.listing;
  if (listing === null || listing.extra?.['reference'] !== undefined) return parsed;

  const reference = publishedReference(listing.description);
  if (reference === undefined) return parsed;

  return { ...parsed, listing: { ...listing, extra: { ...listing.extra, reference } } };
}
