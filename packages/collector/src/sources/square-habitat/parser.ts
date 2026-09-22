/**
 * Source : Square Habitat (squarehabitat.fr) — le réseau immobilier du Crédit
 * Agricole. Demandée par son nom pour l'agence de Cagnes-sur-Mer.
 *
 * ELLE AVAIT ÉTÉ REFUSÉE LE 2026-08-15, et le refus était périmé. Le motif
 * d'alors — « `robots.txt` interdit `/resultat-location` » — reste vrai mot
 * pour mot ; c'est le site qui a changé. Son `robots.txt` s'ouvre aujourd'hui
 * sur « bloquage des pages refonte », et les annonces ont déménagé sous
 * `/annonces/…`, que rien n'interdit. La sonde de réveil, elle, demandait
 * seulement si l'ANCIEN chemin s'était rouvert : elle a donc répondu « toujours
 * refusée » pendant des semaines, en toute bonne foi.
 *
 * TOUT TIENT SUR LA PAGE DE LISTE, et c'est rare : prix, pièces, surface,
 * commune, code postal, description entière. Aucune fiche à visiter — une
 * requête par commune, et rien de plus.
 *
 * DEUX LECTURES SE COMPLÈTENT, parce que le site est une application Angular
 * rendue côté serveur :
 *
 *   - les CARTES (`msl-card`) portent le texte visible. On s'appuie sur leur
 *     `id` et sur des classes de métier, jamais sur les attributs
 *     `_ngcontent-ng-c2172786321` qui changent à chaque déploiement ;
 *   - un bloc JSON-LD par bien porte l'URL canonique, le code postal et les
 *     COORDONNÉES. Elles valent trente points au dédoublonnage et évitent un
 *     géocodage : c'est la meilleure donnée de la page.
 *
 * LE SITE ÉLARGIT SILENCIEUSEMENT AUX COMMUNES VOISINES. La page de
 * Cagnes-sur-Mer, qui n'a aucune location, rend huit annonces de Nice, Cannes,
 * Pégomas et Mandelieu sans le dire autrement qu'en petits caractères. La
 * commune de CHAQUE carte est donc lue et vérifiée ; le titre de la page ne
 * prouve rien.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { compactListing, type ParsedList } from '../shared/raw-listing.js';

/** « Location appartement 2 pièces - 41.8m² à Nice (06000) » — tout y est. */
const ALT = /^Location\s+(.+?)\s+-\s+([\d.,]+)\s*m²\s+à\s+(.+?)\s*\((\d{5})\)/i;

/** L'identifiant du bien, porté par l'id de la carte : « id-<uuid> ». */
const CARD_ID = /^id-(.+)$/;

interface Geo {
  readonly url: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly postalCode?: string;
}

/**
 * Les blocs JSON-LD `Apartment`, rangés par identifiant de bien.
 *
 * L'identifiant se lit en queue de l'URL canonique : c'est la seule clé qui
 * relie un bloc à sa carte, le JSON-LD ne portant aucun `id`.
 */
export function geoByReference(html: string): Map<string, Geo> {
  const $ = cheerio.load(html);
  const out = new Map<string, Geo>();
  $('script[type="application/ld+json"]').each((_, node) => {
    let data: unknown;
    try {
      data = JSON.parse($(node).text());
    } catch {
      // Un bloc illisible n'est pas une panne : les autres biens restent lus.
      return;
    }
    if (data === null || typeof data !== 'object') return;
    const item = data as Record<string, unknown>;
    if (item['@type'] !== 'Apartment' || typeof item['url'] !== 'string') return;
    const reference = item['url'].split('/').pop();
    if (reference === undefined || reference === '') return;
    const geo = item['geo'] as Record<string, unknown> | undefined;
    const address = item['address'] as Record<string, unknown> | undefined;
    out.set(reference, {
      url: item['url'],
      ...(typeof geo?.['latitude'] === 'number' ? { latitude: geo['latitude'] } : {}),
      ...(typeof geo?.['longitude'] === 'number' ? { longitude: geo['longitude'] } : {}),
      ...(typeof address?.['postalCode'] === 'string' ? { postalCode: address['postalCode'] } : {}),
    });
  });
  return out;
}

/** Assemble une annonce à partir d'une carte déjà jugée dans le périmètre. */
function buildListing(fields: {
  card: cheerio.Cheerio<never>;
  reference: string;
  sourceUrl: string;
  price: string;
  city: string;
  postalCode: string;
  parsed: RegExpExecArray | null;
  geo: Geo | undefined;
  agencyName: string;
}): RawListing {
  const { card, reference, sourceUrl, price, city, postalCode, parsed, geo, agencyName } = fields;
  const image = card.find('img.card-top-img').first().attr('src');
  return compactListing({
    sourceRef: reference,
    sourceUrl,
    title: cleanText(card.find('.card-title').first().text()) || undefined,
    description: cleanText(card.find('.card-description').first().text()) || undefined,
    priceText: price || undefined,
    // « cc » à côté du prix : le loyer est annoncé charges comprises.
    chargesText: cleanText(card.find('.prix-mention').first().text()) || undefined,
    areaText: parsed?.[2] === undefined ? undefined : `${parsed[2]} m²`,
    roomsText: parsed?.[1],
    propertyTypeText: parsed?.[1],
    cityText: city || undefined,
    postalCodeText: postalCode,
    ...(geo?.latitude !== undefined ? { latitude: geo.latitude } : {}),
    ...(geo?.longitude !== undefined ? { longitude: geo.longitude } : {}),
    agencyName,
    ...(typeof image === 'string' && image !== '' ? { imageUrls: [image] } : {}),
  });
}

/**
 * Les annonces d'une page de résultats.
 *
 * @param cityAllowed dit si une commune entre dans le périmètre. C'est le seul
 *   garde-fou contre l'élargissement silencieux du site, et il est obligatoire.
 *
 *   IL JUGE SUR LE NOM, PAS SUR LE CODE POSTAL, et c'est ce qui l'a sauvé :
 *   Nice en a quatre — 06000, 06100, 06200, 06300 —, le périmètre du projet
 *   n'en nomme qu'un, et trois annonces niçoises sur cinq seraient parties à
 *   la poubelle sans un mot.
 */
export function parseListPage(
  html: string,
  pageUrl: string,
  agencyName: string,
  cityAllowed: (city: string, postalCode: string) => boolean,
): ParsedList {
  const $ = cheerio.load(html);
  const geos = geoByReference(html);
  const listings: RawListing[] = [];
  const warnings: string[] = [];
  let elargies = 0;

  $('msl-card[id^="id-"]').each((_, node) => {
    const card = $(node);
    const reference = CARD_ID.exec(card.attr('id') ?? '')?.[1];
    if (reference === undefined) return;

    const alt = card.find('img.card-top-img').first().attr('alt') ?? '';
    const parsed = ALT.exec(cleanText(alt));
    const geo = geos.get(reference);
    const postalCode = parsed?.[4] ?? geo?.postalCode;
    if (postalCode === undefined) {
      warnings.push(`Carte ${reference} sans code postal : ignorée`);
      return;
    }
    const city = cleanText(card.find('.card-localisation').first().text()) || (parsed?.[3] ?? '');
    if (!cityAllowed(city, postalCode)) {
      elargies += 1;
      return;
    }

    const price = cleanText(card.find('.prix-valeur').first().text());
    const sourceUrl = geo?.url ?? new URL(`#${reference}`, pageUrl).href;

    listings.push(
      buildListing({
        // `Cheerio<never>` : la convention du projet pour un nœud déjà ciblé.
        card: card as cheerio.Cheerio<never>,
        reference,
        sourceUrl,
        price,
        city,
        postalCode,
        parsed,
        geo,
        agencyName,
      }),
    );
  });

  // Dit, et non tu : c'est la trace qui permettra de voir le jour où le site
  // ne rend PLUS QUE des communes voisines.
  if (elargies > 0) {
    warnings.push(`${elargies} annonce(s) hors périmètre écartées (élargissement du site)`);
  }
  return { listings, warnings };
}
