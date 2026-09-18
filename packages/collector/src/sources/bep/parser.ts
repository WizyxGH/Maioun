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
import { parsePublishedReference } from '../../normalization/parse-listing-fields.js';
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
 * relue depuis le retrait du repli n'en portait plus — et les quatre-vingt-sept
 * qui en affichaient encore une montraient l'identifiant d'URL Apimo, un numéro
 * fabriqué que l'agence ne reconnaît pas quand on le lui cite. Relevé le
 * 2026-09-18 : 113 des 114 fiches BEP en base publient cette ligne.
 *
 * LE MOTIF EST CELUI DE LA NORMALISATION, et pas une copie : le rejeu sur le
 * texte déjà stocké s'en sert aussi, et Paru Vendu recopie la même ligne en
 * relayant les annonces BEP. Deux versions du motif auraient divergé au premier
 * réglage, et la moitié du stock n'en aurait pas profité.
 */
export function publishedReference(description: string | undefined): string | undefined {
  return parsePublishedReference(description) ?? undefined;
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
