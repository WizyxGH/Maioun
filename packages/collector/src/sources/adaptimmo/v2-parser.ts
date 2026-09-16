/**
 * Nouveau gabarit AdaptImmo (`/fr/liste-location`, `/fr/detail-bien-{cle}`),
 * que `parser.ts` (ancien `liste.htm`) ne lit pas.
 *
 * La page de liste porte un JSON-LD `@graph` d'une entrée par bien : loyer
 * hors charges, surface, pièces, commune et description complète. La fiche
 * HTML, elle, est rendue en JavaScript : ses données viennent de l'API publique
 * de la plateforme (`reach.adaptimmo.com/mywebsite/bien`), qui ajoute charges,
 * dépôt, honoraires, DPE et toutes les photos.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanMultiline, cleanText } from '../../normalization/text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';
import { energyLabels } from '../shared/labels.js';

/** API qui alimente la fiche d'un bien, commune à toutes les agences. */
export const V2_DETAIL_API = 'https://reach.adaptimmo.com/mywebsite/bien';

/** Adresse de l'API pour un bien ; le groupe est l'agence elle-même par défaut. */
export function v2DetailApiUrl(
  reference: string,
  agencyNumber: string,
  groupNumber = agencyNumber,
): string {
  const params = new URLSearchParams({
    NUMPDT: reference,
    NUMAGE: agencyNumber,
    NUMGROUP: groupNumber,
    contactType: '1',
    afficherPrixBiensVendus: 'false',
  });
  return `${V2_DETAIL_API}?${params.toString()}`;
}

/** « NICE CARABACEL » ou « Nice carabacel » : la commune, sans le quartier. */
function cityOf(raw: string | undefined): string | undefined {
  const city = cleanText(raw);
  if (city === '') return undefined;
  return /^nice\b/i.test(city) ? 'Nice' : city;
}

/** « 1 pièce », « 2 pièces ». */
function roomsText(rooms: number | undefined): string | undefined {
  return rooms === undefined ? undefined : `${rooms} pièce${rooms > 1 ? 's' : ''}`;
}

function positive(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\s/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

interface JsonLdProduct {
  readonly name?: string;
  readonly description?: string;
  readonly offers?: { readonly price?: string; readonly url?: string };
  readonly address?: { readonly addressLocality?: string; readonly postalCode?: string };
  readonly floorSize?: { readonly value?: number };
  readonly image?: string;
  readonly numberOfRooms?: number;
}

/** Seules les locations : l'adresse canonique dit « location-annuelle ». */
const RENTAL_URL = /\/annonces\/location[\w-]*\/[^/]+\/[^/]+\/(\d+)$/;

/**
 * Les locations de la page de liste, lues dans son JSON-LD.
 *
 * @param pageUrl adresse de la liste, dont l'origine donne celle des fiches
 */
export function parseV2List(html: string, pageUrl: string, agencyName: string): RawListing[] {
  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;
  const byRef = new Map<string, RawListing>();

  $('script[type="application/ld+json"]').each((_i, el) => {
    let graph: unknown[];
    try {
      const data = JSON.parse($(el).text()) as { '@graph'?: unknown[] };
      graph = Array.isArray(data['@graph']) ? data['@graph'] : [];
    } catch {
      return;
    }
    for (const node of graph) {
      if (typeof node !== 'object' || node === null) continue;
      const item = node as JsonLdProduct;
      const ref = RENTAL_URL.exec(item.offers?.url ?? '')?.[1];
      if (ref === undefined || byRef.has(ref)) continue;

      const sourceUrl = `${origin}/fr/detail-bien-${ref}?idBien=${ref}`;
      const type = cleanText(item.name);
      const city = cityOf(item.address?.addressLocality);
      const price = positive(item.offers?.price);
      const area = positive(item.floorSize?.value);
      const rooms = positive(item.numberOfRooms);
      const description = cleanMultiline(item.description ?? '');

      byRef.set(
        ref,
        compactListing({
          sourceRef: ref,
          sourceUrl,
          title:
            type !== '' ? `${type} à louer${city !== undefined ? ` — ${city}` : ''}` : undefined,
          description: description === '' ? undefined : description,
          // Le JSON-LD donne le loyer hors charges ; la carte, charges comprises.
          priceText: price !== undefined ? `${price} € hors charges` : undefined,
          areaText: area !== undefined ? `${area} m²` : undefined,
          roomsText: roomsText(rooms),
          propertyTypeText: type === '' ? undefined : type,
          cityText: city,
          postalCodeText: item.address?.postalCode,
          agencyName,
          contactFormUrl: sourceUrl,
          imageUrls: item.image !== undefined ? [item.image] : undefined,
        }),
      );
    }
  });

  return [...byRef.values()];
}

/** Réponse de l'API des fiches : champs utiles seulement. */
interface ApiBien {
  readonly ope?: number;
  readonly libtype?: string;
  readonly texte?: string;
  readonly prix?: string;
  readonly charges_mens?: string;
  readonly depot_garantie?: string;
  readonly honoraires_loc?: string;
  readonly surfhab?: number;
  readonly piece?: number;
  readonly meuble?: number;
  readonly ville?: string;
  readonly villeweb?: string;
  readonly cp?: string;
  /** Voie du bien, et son complément, quand l'agence les publie. */
  readonly adresse?: string;
  readonly adresse_suite?: string;
  /** Quartier du bien : `quartier_lib` est le libellé, `quartier` la saisie libre. */
  readonly quartier?: string;
  readonly quartier_lib?: string;
  readonly mandat?: string | number;
  readonly dpe_lettre_consom_energ?: string;
  /** Étiquette climat, clé jumelle. */
  readonly dpe_lettre_emissions_ges?: string;
  readonly [key: string]: unknown;
}

/** Ce que l'API apprend ; `null` si la réponse n'est pas une location. */
export function parseV2Detail(body: string): RawDraft | null {
  let bien: ApiBien;
  try {
    bien = JSON.parse(body) as ApiBien;
  } catch {
    return null;
  }
  // `ope` 2 = location ; une vente ou une réponse vide n'apprend rien.
  if (bien.ope !== 2) return null;
  const rent = positive(bien.prix);
  if (rent === undefined) return null;

  const texte = cheerio.load(`<div>${(bien.texte ?? '').replace(/<br\s*\/?>/gi, '\n')}</div>`);
  // La mention Géorisques est ajoutée par la plateforme à chaque bien.
  const description = cleanMultiline(texte('div').first().text())
    .replace(/Les informations sur les risques[\s\S]*$/, '')
    .trim();

  const charges = positive(bien.charges_mens);
  const deposit = positive(bien.depot_garantie);
  const fees = positive(bien.honoraires_loc);
  const area = positive(bien.surfhab);
  const rooms = positive(bien.piece);
  const dpe = bien.dpe_lettre_consom_energ;
  const ges = bien.dpe_lettre_emissions_ges;
  const imageUrls = Object.keys(bien)
    .filter((key) => /^photo\d+$/.test(key))
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .map((key) => bien[key])
    .filter((url): url is string => typeof url === 'string' && url.startsWith('https://'));

  /**
   * LE QUARTIER VIENT DE `quartier_lib`/`quartier`, JAMAIS DE `secteur`.
   *
   * `secteur` est la grille interne de l'agence — une poignée de cases
   * (« CENTRE », « OUEST », « NORD »…) où elle range ses biens pour son propre
   * classement. Le site ne l'affiche nulle part : la carte et la fiche ne
   * montrent que la commune. En le prenant pour le quartier, on publiait une
   * localisation que la source ne publie pas — et deux fois sur six, elle
   * démentait la description : `06024461` et `06024378` disent « NICE NORD »
   * en première ligne et se retrouvaient placés au centre-ville, à trois
   * kilomètres de là. Faute de quartier, mieux vaut n'en annoncer aucun : la
   * normalisation lit alors le texte, qui le nomme (§17).
   *
   * `latitude`/`longitude` sont dans la même réponse et paraissent précis. Ils
   * ne le sont pas : c'est le centre du CODE POSTAL. Deux biens de 06100 —
   * l'un à Libération, l'autre à Nice Nord — portent les mêmes coordonnées au
   * dix-millionième près. On ne les lit pas.
   */
  const quartier = cleanText(bien.quartier_lib) || cleanText(bien.quartier);
  const street = [cleanText(bien.adresse), cleanText(bien.adresse_suite)]
    .filter((part) => part !== '')
    .join(' ');

  return {
    ...(street !== '' ? { addressText: street } : {}),
    description: description === '' ? undefined : description,
    priceText: `${rent} € hors charges`,
    chargesText: charges !== undefined ? `${charges} €` : undefined,
    depositText: deposit !== undefined ? `${deposit} €` : undefined,
    feesText: fees !== undefined ? `${fees} €` : undefined,
    areaText: area !== undefined ? `${area} m²` : undefined,
    roomsText: roomsText(rooms),
    propertyTypeText: cleanText(bien.libtype) || undefined,
    furnishedText: bien.meuble === 1 ? 'Meublé' : bien.meuble === 0 ? 'Non meublé' : undefined,
    cityText: cityOf(bien.villeweb ?? bien.ville),
    postalCodeText: bien.cp,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      ...(bien.mandat !== undefined && String(bien.mandat) !== ''
        ? { reference: String(bien.mandat) }
        : {}),
      ...(quartier !== '' ? { quartier } : {}),
      ...energyLabels(dpe, ges),
    },
  };
}
