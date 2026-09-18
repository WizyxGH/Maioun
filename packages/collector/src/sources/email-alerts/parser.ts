/**
 * Source : ALERTES E-MAIL des portails (Leboncoin, SeLoger, Bien'ici…) — §6, §10.
 *
 * Voie 100 % conforme pour les portails qui interdisent l'accès automatisé
 * (DataDome) : ce n'est PAS du scraping. L'utilisateur crée une alerte de
 * recherche sur le portail ; le portail LUI envoie par e-mail les nouvelles
 * annonces ; Maïoun lit ces e-mails dans SA boîte (IMAP, lecture seule) et
 * en extrait les annonces. Aucune connexion au portail, aucun contournement.
 *
 * Ce module ne fait QUE le parsing du HTML d'un e-mail (pur, testable). Le
 * transport IMAP vit dans `core/email-import.ts`.
 *
 * Les e-mails sont des gabarits « tableau » : chaque annonce est un bloc
 * contenant un lien-image, un lien-titre (« Appartement · 3 pièces · 67 m² »)
 * et un prix, chacun pointant vers un lien de TRACKING distinct. On part donc
 * du lien-TITRE (seul repérable de façon fiable), on remonte à son bloc, et on
 * y lit prix, lieu, référence et annonceur.
 *
 * CE QUE LE MESSAGE ÉCRIT EST TOUT CE QU'ON AURA. Le redirecteur de SeLoger
 * interdit les robots, son jeton est chiffré et sa fiche répond 403 : aucune
 * lecture de la fiche ne viendra compléter le digest, aujourd'hui ni demain.
 * D'où le soin porté ici à ne rien laisser passer — quartier, commune,
 * référence d'annonceur, nom d'agence — et à fabriquer une identité qui ne
 * bouge pas d'un envoi à l'autre. On n'invente jamais l'absent pour autant
 * (§17).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { parseArea, parsePrice } from '../../normalization/parse-listing-fields.js';
import {
  communeNameBefore,
  communeWithPostalCode,
  isPlausibleCommune,
} from '../../normalization/commune.js';

/** Portail reconnu et comment en tirer une référence stable depuis l'URL. */
interface Portal {
  readonly id: string;
  readonly host: RegExp;
  /** Extrait l'identifiant de l'annonce depuis l'URL réelle (canonique). */
  readonly reference: (url: URL) => string | null;
}

const PORTALS: readonly Portal[] = [
  {
    id: 'leboncoin',
    host: /(^|\.)leboncoin\.fr$/i,
    reference: (url) => /(\d{8,})/.exec(url.pathname)?.[1] ?? null,
  },
  {
    id: 'seloger',
    host: /(^|\.)seloger\.com$/i,
    // Deux générations d'identifiants coexistent : l'ancien tout numérique et
    // l'actuel alphanumérique en capitales (« /annonce/262DQEQC5SVU »).
    reference: (url) =>
      /\/([0-9A-Z]{8,})\/?$/.exec(url.pathname)?.[1] ??
      /\/(\d{6,})/.exec(url.pathname)?.[1] ??
      null,
  },
  {
    id: 'bienici',
    host: /(^|\.)bienici\.com$/i,
    reference: (url) => /\/annonce\/([a-z0-9-]+)/i.exec(url.pathname)?.[1] ?? null,
  },
];

/** Sous-domaines de tracking : l'href y pointe, la vraie URL est ailleurs. */
const TRACKING_HOST = /(^|\.)(click|link|clic|url\d*|email|mail|t)\./i;

interface Resolved {
  readonly portal: Portal;
  readonly url: URL;
  /** Vraie URL d'annonce (pas un sous-domaine de tracking). */
  readonly canonical: boolean;
}

/** Décode un segment base64url s'il contient une URL http (cas Bien'ici). */
function decodeEmbeddedUrl(segment: string): string | null {
  if (segment.length < 24 || !/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  try {
    const decoded = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Toutes les URL candidates cachées dans un href (params + segments base64). */
function urlCandidates(href: string): string[] {
  const out = [href];
  let outer: URL | undefined;
  try {
    outer = new URL(href);
  } catch {
    return out;
  }
  for (const value of outer.searchParams.values()) {
    if (/^https?%3a|^https?:\/\//i.test(value)) out.push(decodeURIComponent(value));
  }
  for (const segment of outer.pathname.split('/')) {
    const embedded = decodeEmbeddedUrl(segment);
    if (embedded !== null) out.push(embedded);
  }
  return out;
}

/**
 * L'hôte à NOMMER quand aucun portail ne reconnaît un lien d'annonce.
 *
 * Le lien visible est souvent celui d'un routeur d'e-mails, la vraie
 * destination étant cachée dans un paramètre ou un segment base64 : nommer le
 * routeur n'apprendrait rien. On rend donc la première destination hors
 * tracking — le même ordre de préférence que `resolvePortalUrl` —, et le
 * routeur seulement s'il n'y a rien d'autre. `null` pour un `mailto:`, un
 * `tel:` ou une adresse illisible, qui ne désignent aucune annonce.
 */
function unknownHostOf(href: string): string | null {
  let tracking: string | null = null;
  for (const candidate of urlCandidates(href)) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    const host = url.hostname.toLowerCase();
    if (!TRACKING_HOST.test(host)) return host;
    tracking ??= host;
  }
  return tracking;
}

/**
 * Dénoue une URL de lien d'e-mail vers son portail d'origine. On teste l'href,
 * ses paramètres, puis ses segments base64. `null` si aucun portail reconnu.
 */
export function resolvePortalUrl(href: string): Resolved | null {
  let fallback: Resolved | null = null;
  for (const candidate of urlCandidates(href)) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    const portal = PORTALS.find((p) => p.host.test(url.hostname));
    if (portal === undefined) continue;
    const resolved: Resolved = { portal, url, canonical: !TRACKING_HOST.test(url.hostname) };
    // On préfère la vraie URL d'annonce (canonique) à un sous-domaine de
    // tracking : Bien'ici encode la vraie URL en base64 APRÈS le lien `link.…`.
    if (resolved.canonical) return resolved;
    fallback ??= resolved;
  }
  return fallback;
}

/**
 * Premier montant « … € » trouvé (loyer). On n'accepte les espaces qu'entre
 * milliers (« 1 890 € ») pour ne pas avaler un code postal collé au prix
 * (« 06000 570 € » → « 570 € »).
 */
function findPrice(text: string): string | undefined {
  const match = /(?<!\d)(\d{1,3}(?:[\s\u00a0 .]\d{3})+|\d{1,4})\s*\u20ac/.exec(text);
  return match?.[0]?.replace(/[\s\u00a0 ]+/g, ' ').trim();
}

/** Première surface « … m² » trouvée dans un texte. */
function findArea(text: string): string | undefined {
  return /(\d[\d.,]*)\s*m²/i.exec(text)?.[0];
}

/** Ce qu'un bloc de digest dit du lieu. */
interface Place {
  city?: string;
  postalCode?: string;
  /** Quartier/secteur, quand le digest le nomme à part de la commune. */
  district?: string;
}

/**
 * Nettoie un morceau de nom de lieu ; `undefined` s'il n'en reste rien.
 *
 * Un libellé d'action — « Voir l'annonce », « En savoir plus » — est refusé
 * ici : le digest le colle contre le code postal, et rien dans sa forme ne le
 * distingue d'un nom propre.
 */
function placeName(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const clean = cleanText(raw)
    .replace(/[^A-Za-zÀ-ÿ'’ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean === '' || !isPlausibleCommune(clean) ? undefined : clean;
}

/**
 * « Quartier, Commune (06300) » — la forme des digests SeLoger.
 *
 * C'est LA forme majoritaire, et elle ne rendait rien du tout : l'ancienne
 * lecture remontait mot à mot depuis le code postal, butait sur la parenthèse
 * ouvrante et abandonnait. Relevé le 2026-09-16 sur quatorze jours de digests :
 * 1 % des annonces SeLoger portaient une commune, aucune un quartier, alors que
 * le message écrit les deux en toutes lettres.
 */
const SELOGER_PLACE =
  /(?:([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]{1,40}?)\s*,\s*)?([A-ZÀ-Ý][A-Za-zÀ-ÿ'’ -]{1,40}?)\s*\((\d{5})\)/;

/**
 * « 06000 Nice » — la forme des digests Bien'ici, et la fin de « Fabron 06200
 * Nice » chez SeLoger.
 *
 * LA COMMUNE EST APRÈS LE CODE POSTAL, et c'est elle qu'il faut retenir : ce
 * qui précède est un quartier. L'ancienne lecture ne regardait qu'en amont et
 * rangeait donc « Fabron » — un quartier de Nice — dans la commune. La ville
 * préfixe les clés du dédoublonnage : ainsi située, l'annonce ne pouvait plus
 * être rapprochée d'aucune de Nice.
 */
const POSTAL_THEN_CITY = /(\d{5})\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*(?:[ -][A-Za-zÀ-ÿ'’-]+){0,3})/;

/**
 * Le lieu d'une annonce, lu dans le texte de son bloc.
 *
 * QUATRE ÉCRITURES COEXISTENT, essayées de la plus explicite à la plus fragile.
 * La forme parenthésée nomme les deux ; la virgule « Nice, 06100 » désigne la
 * commune sans ambiguïté ; « 06000 Nice » la met après le code ; la remontée
 * mot à mot ne fait que deviner et reste en dernier recours.
 *
 * L'ORDRE EST LE CORRECTIF. « Nice, 06100 Voir l'annonce » se lisait par la
 * troisième forme, qui prenait le libellé du bouton pour la commune : vingt et
 * une fiches affichaient « 06200 Voir L Annonce » en guise d'adresse. La
 * virgule, elle, dit que la commune PRÉCÈDE le code — donc que ce qui suit
 * n'en est pas une.
 */
function findLocation(text: string): Place {
  const parenthese = SELOGER_PLACE.exec(text);
  if (parenthese?.[3] !== undefined) {
    const city = placeName(parenthese[2]);
    const district = placeName(parenthese[1]);
    return {
      ...(city !== undefined ? { city } : {}),
      ...(district !== undefined && district !== city ? { district } : {}),
      postalCode: parenthese[3],
    };
  }

  const virgule = communeWithPostalCode(text);
  if (virgule !== undefined) return { city: virgule.city, postalCode: virgule.postalCode };

  const apres = POSTAL_THEN_CITY.exec(text);
  if (apres?.[1] !== undefined) {
    const city = placeName(apres[2]);
    const district = placeName(communeNameBefore(text, apres.index));
    return {
      ...(city !== undefined ? { city } : {}),
      ...(district !== undefined && district !== city ? { district } : {}),
      postalCode: apres[1],
    };
  }

  const match = /(\d{5})\b/.exec(text);
  if (match?.[1] === undefined) return {};
  const city = communeNameBefore(text, match.index);
  return { ...(city !== undefined ? { city } : {}), postalCode: match[1] };
}

/**
 * LA RÉFÉRENCE QUE L'ANNONCEUR LUI-MÊME DONNE, quand le digest l'écrit.
 *
 * Bien'ici imprime « RÉFÉRENCE : 87354095 », LocService « Réf. p-cf-… ». Ce
 * n'est PAS l'identifiant du portail — celui-là vit dans l'URL — mais celui de
 * l'agence, et c'est justement ce qui le rend précieux : c'est le même numéro
 * que porte l'annonce chez l'agence, donc de quoi rapprocher un digest de la
 * source directe. Aucune annonce de digest n'en avait jusqu'ici.
 *
 * Il ne sert JAMAIS de `sourceRef` : deux portails peuvent publier la même
 * référence d'agence, et les occurrences se confondraient.
 */
function findAdvertiserReference(text: string): string | undefined {
  const match =
    /\br[ée]f(?:[ée]rence)?\s*(?:n[°o]\s*)?[:.]?\s*([A-Za-z0-9][A-Za-z0-9_-]{3,29})\b/i.exec(text);
  return match?.[1];
}

/**
 * L'AGENCE QUI PROPOSE LE BIEN, nommée par les digests « exclusivité ».
 *
 * Les alertes ordinaires taisent l'annonceur, mais SeLoger envoie aussi des
 * messages « X vous adresse ses dernières exclusivités », dont le corps répète
 * « X vous propose une nouvelle annonce en partenariat avec SeLoger ». Sur
 * quatorze jours, dix-neuf digests sur cent trente-sept sont de cette forme —
 * et aucune annonce d'alerte e-mail n'avait jamais porté de nom d'agence.
 *
 * Le nom vaut plus que l'affichage : `agency-discovery` s'en sert pour repérer
 * les agences qui ne sont pas encore une source, et le rapprochement compare
 * les annonceurs.
 */
const AGENCY_PHRASE = /vous propose une nouvelle annonce en partenariat/i;

function findAgencyName($: cheerio.CheerioAPI): string | undefined {
  /**
   * ON LIT LA STRUCTURE, PAS LA PHRASE. Le texte aplati donne « Annonce
   * exclusive Nice A.G.I.R vous propose… » : aucune règle sur les majuscules ne
   * sait où commence le nom, puisque « Nice » en porte une aussi. Dans le HTML,
   * en revanche, le nom est seul dans un `<b>` — et ce gras-là ne se met pas
   * par hasard.
   */
  let found: string | undefined;
  $('b, strong').each((_i, el) => {
    if (found !== undefined) return;
    const node = $(el);
    const name = cleanText(node.text().replace(/\s+/g, ' ')).trim();
    if (name.length < 3 || name.length > 60) return;
    const around = cleanText((node.parent().text() ?? '').replace(/\s+/g, ' '));
    const phrase = around.search(AGENCY_PHRASE);
    const position = around.indexOf(name);
    // Le nom doit PRÉCÉDER la phrase : un gras qui la suit dit autre chose.
    if (phrase === -1 || position === -1 || position > phrase) return;
    found = name;
  });
  return found;
}

/**
 * Détails du bien lus dans le texte du bloc : typologie, pièces/chambres,
 * meublé, charges. On ne devine pas l'absent (§17) — chaque champ reste absent
 * si le digest ne le donne pas.
 */
interface ListingDetails {
  readonly propertyTypeText?: string;
  readonly roomsText?: string;
  readonly furnishedText?: string;
  readonly chargesIncluded: boolean;
}

function extractDetails(text: string): ListingDetails {
  const pieces = /\d+\s*pièces?/i.exec(text)?.[0];
  const chambres = /\d+\s*chambres?/i.exec(text)?.[0];
  // « X pièces • Y chambres » alimente à la fois le nb de pièces et de chambres.
  const roomsText = [pieces, chambres].filter((p) => p !== undefined).join(' • ') || undefined;

  // Type explicite d'abord ; à défaut, la présence de « pièce(s) » désigne un
  // appartement (jamais une simple chambre ni un parking) — ce qui évite en
  // prime que « 1 chambre » (nb de chambres) soit pris pour une location de
  // chambre par la normalisation.
  let propertyTypeText: string | undefined;
  if (/\bstudio\b/i.test(text)) propertyTypeText = 'studio';
  else if (/\bmaison\b|\bvilla\b/i.test(text)) propertyTypeText = 'maison';
  else if (/\bloft\b/i.test(text)) propertyTypeText = 'loft';
  else if (/\bduplex\b/i.test(text)) propertyTypeText = 'duplex';
  else if (/\bappartement\b/i.test(text) || pieces !== undefined) propertyTypeText = 'appartement';

  let furnishedText: string | undefined;
  if (/\bnon\s+meubl/i.test(text)) furnishedText = 'non meublé';
  else if (/\bmeubl[ée]/i.test(text)) furnishedText = 'meublé';

  const chargesIncluded = /charges comprises|\bcc\b|\+\s*cc\b|\btcc\b/i.test(text);

  return {
    ...(propertyTypeText !== undefined ? { propertyTypeText } : {}),
    ...(roomsText !== undefined ? { roomsText } : {}),
    ...(furnishedText !== undefined ? { furnishedText } : {}),
    chargesIncluded,
  };
}

/**
 * Référence de repli quand le portail n'expose pas d'identifiant (SeLoger).
 *
 * C'EST LA SEULE IDENTITÉ QU'AURONT CES ANNONCES : le lien du digest est une
 * redirection que l'on ne suit pas, et la fiche du portail refuse les robots.
 * Elle doit donc être RIGOUREUSEMENT la même d'un envoi à l'autre, sans quoi la
 * même annonce revient sous plusieurs identités.
 *
 * ELLE NE TIENT QUE DE VALEURS NORMALISÉES — surface et loyer en NOMBRES, code
 * postal — et jamais du texte source. Slugué tel quel, « 21m² » et « 21 m² »
 * donnaient `21m-620-06300` et `21-m-620-06300` : deux occurrences pour un seul
 * studio. Relevé le 2026-09-16 : quinze groupes portaient de deux à cinq
 * références SeLoger pour le même bien.
 *
 * La commune en est absente pour la même raison : son extraction progresse, et
 * une identité qui bouge quand un parseur s'améliore réinvente l'annonce en
 * double. Le code postal situe déjà, et ne bouge pas.
 */
function contentReference(
  portalId: string,
  parts: readonly (number | string | undefined)[],
): string {
  const slug = parts
    .filter((p): p is number | string => p !== undefined && p !== '')
    .map((p) => String(p))
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug !== '' ? slug : `${portalId}-inconnu`;
}

/** Type minimal d'un nœud cheerio (évite d'importer les types d'éléments). */
type Node = ReturnType<cheerio.CheerioAPI>;

/** URL qui pointe vraiment vers une photo (extension image, éventuel `?token`). */
const IMAGE_URL = /\.(?:jpe?g|png|webp)(?:[?&#]|$)/i;
/**
 * Habillage d'e-mail à écarter : logos, icônes sociales, pixels de tracking, et
 * surtout les ASSETS de gabarit marketing (badges « exclusivité », flèches
 * « voir l'annonce », boutons). Les vraies photos sont sur les CDN photo des
 * portails (`mms.seloger.com`, `file.bienici.com`, `img.leboncoin.fr`), jamais
 * sur les hôtes d'e-mailing (`image.by.seloger.com/lib/…`, `mail-sender.…`).
 */
const IMAGE_DENY =
  /mail-sender|by\.seloger|\/lib\/|\/static\/|facebook|instagram|linkedin|twitter|x_round|transparent|spacer|pixel|logo|badge|fleche|arrow|bouton|button|exclusiv/i;

/**
 * Première photo d'annonce trouvée dans un nœud. Les digests placent la photo
 * soit en `<img src>` (Bien'ici), soit en `background-image` CSS / VML Outlook
 * (SeLoger) — on regarde les deux, en filtrant l'habillage.
 */
function findImage($: cheerio.CheerioAPI, node: Node): string | undefined {
  const urls: string[] = [];
  node.find('img[src]').each((_i, el) => {
    const src = $(el).attr('src');
    if (src !== undefined) urls.push(src);
  });
  node.find('[style*="background"]').each((_i, el) => {
    const match = /url\(\s*['"]?(https?:\/\/[^'")\s]+)/i.exec($(el).attr('style') ?? '');
    if (match?.[1] !== undefined) urls.push(match[1]);
  });
  return urls.find((url) => IMAGE_URL.test(url) && !IMAGE_DENY.test(url));
}

/**
 * Remonte au bloc de l'annonce et y repère sa photo. Le bloc « texte » est le
 * 1er ancêtre portant un prix (tight, pour ne pas mélanger les voisins) ; la
 * photo, elle, vit souvent un cran plus haut (rangée image au-dessus du titre),
 * donc on continue de remonter pour la trouver — chaque annonce a la sienne.
 */
function climbToBlock(anchor: Node, $: cheerio.CheerioAPI): { block: Node; image?: string } {
  let node = anchor;
  let block: Node | null = null;
  let image: string | undefined;
  for (let depth = 0; depth < 6; depth += 1) {
    const parent = node.parent();
    if (parent.length === 0) break;
    node = parent;
    if (block === null && /€/.test(node.text())) block = node;
    if (image === undefined) image = findImage($, node);
    if (block !== null && image !== undefined) break;
  }
  return { block: block ?? anchor, image };
}

/**
 * L'ANCIEN loyer, quand le digest annonce une baisse.
 *
 * SeLoger envoie de vrais messages « Baisse de prix : … », et le bloc de
 * l'annonce porte alors le loyer précédent BARRÉ, suivi de l'écart :
 *
 *   <a name="adpricechange1_1" …><s>750 €</s> ↘&nbsp;7%</a>
 *
 * CE SIGNAL EST LE SEUL DE SON ESPÈCE. Partout ailleurs, une baisse ne se
 * découvre qu'en comparant deux collectes — donc jamais sur une annonce vue
 * pour la première fois, et jamais sur celles qui n'arrivent QUE par ces
 * digests. Ici le portail nous le dit lui-même, dès la première rencontre.
 *
 * ON EXIGE LES DEUX MARQUES : l'attribut `name` qui commence par
 * `adpricechange`, et le loyer barré. Un `<s>` isolé peut être n'importe quoi
 * dans un e-mail composé en tableaux ; l'attribut, lui, ne se pose pas par
 * hasard.
 */
function findPreviousPrice($: cheerio.CheerioAPI, block: Node): string | undefined {
  const marque = block.find('a[name^="adpricechange"]').first();
  if (marque.length === 0) return undefined;
  const barre = marque.find('s').first();
  if (barre.length === 0) return undefined;
  return findPrice(cleanText(barre.text()));
}

/**
 * L'identité de repli, bâtie sur des VALEURS et non sur leur écriture.
 *
 * Surface et loyer passent par les mêmes analyseurs que la normalisation : la
 * valeur identifie l'annonce, pas la façon dont le digest l'a écrite ce jour-là.
 */
function fallbackReference(
  portalId: string,
  title: string,
  areaText: string | undefined,
  priceText: string | undefined,
  postalCode: string | undefined,
): string {
  const area = parseArea(areaText);
  const price = parsePrice(priceText).amount;
  return contentReference(portalId, [
    area ?? undefined,
    price ?? undefined,
    postalCode,
    // Rien de mesuré : plutôt que de confondre toutes les annonces sans chiffre,
    // on retombe sur le titre — faible, mais propre à l'annonce.
    area === null && price === null ? title : undefined,
  ]);
}

/** Construit l'annonce à partir de son lien-titre (celui qui porte « m² »). */
function buildFromTitle(
  $: cheerio.CheerioAPI,
  anchor: Node,
  title: string,
  resolved: Resolved,
  /** Nom d'agence lu en tête du message, quand il en porte un. */
  agencyName: string | undefined,
): RawListing | null {
  const { portal, url, canonical } = resolved;
  const { block, image } = climbToBlock(anchor, $);
  const blockText = cleanText(block.text().replace(/\s+/g, ' '));
  const previousPrice = findPreviousPrice($, block);
  const advertiserReference = findAdvertiserReference(blockText);

  const rawPrice = findPrice(title) ?? findPrice(blockText);
  const areaText = findArea(title) ?? findArea(blockText);
  const { city, postalCode, district } = findLocation(blockText);
  if (rawPrice === undefined && areaText === undefined) return null;

  // Détails lus dans le titre + le bloc (typologie, pièces, meublé, charges).
  const details = extractDetails(`${title} ${blockText}`);
  // On réinjecte « cc » dans le prix pour que la normalisation marque le loyer
  // comme charges comprises (findPrice ne garde que le montant).
  const priceText =
    rawPrice !== undefined ? (details.chargesIncluded ? `${rawPrice} cc` : rawPrice) : undefined;

  const reference =
    (canonical ? portal.reference(url) : null) ??
    fallbackReference(portal.id, title, areaText, priceText, postalCode);
  // Lien ouvert par l'utilisateur : la vraie URL si on l'a dénouée, sinon le
  // lien de tracking d'origine (qui redirige bien vers l'annonce).
  const sourceUrl = canonical ? `${url.origin}${url.pathname}` : (anchor.attr('href') ?? url.href);

  return {
    sourceRef: `${portal.id}:${reference}`,
    sourceUrl,
    title,
    ...(priceText !== undefined ? { priceText } : {}),
    ...(areaText !== undefined ? { areaText } : {}),
    ...(details.propertyTypeText !== undefined
      ? { propertyTypeText: details.propertyTypeText }
      : {}),
    ...(details.roomsText !== undefined ? { roomsText: details.roomsText } : {}),
    ...(details.furnishedText !== undefined ? { furnishedText: details.furnishedText } : {}),
    ...(city !== undefined ? { cityText: city } : {}),
    ...(postalCode !== undefined ? { postalCodeText: postalCode } : {}),
    ...(agencyName !== undefined ? { agencyName } : {}),
    contactFormUrl: sourceUrl,
    ...(image !== undefined && /^https?:/i.test(image) ? { imageUrls: [image] } : {}),
    extra: {
      // La référence de l'ANNONCEUR, quand le digest la donne. À défaut, RIEN :
      // la nôtre est soit l'identifiant du portail, soit une empreinte
      // titre+surface+prix que nous fabriquons — ni l'une ni l'autre ne se cite
      // au téléphone (§17).
      ...(advertiserReference !== null ? { reference: advertiserReference } : {}),
      portal: portal.id,
      ...(district !== undefined ? { quartier: district } : {}),
      // Le loyer PRECEDENT, quand le digest annonce lui-meme une baisse.
      ...(previousPrice !== undefined ? { previousPrice } : {}),
    },
  };
}

/**
 * Extrait les annonces d'un e-mail d'alerte (HTML). Une occurrence par annonce
 * distincte (dédoublonnée sur la référence). Le `sourceId` de collecte reste
 * `email-alerts` ; le portail d'origine est porté par `sourceUrl` et
 * `extra.portal` (§13, §38).
 */
/**
 * Référence stable d'une annonce depuis son URL canonique (« seloger:262DQ… »).
 *
 * Au parsing, le lien est encore une redirection opaque : la référence est alors
 * fabriquée depuis le contenu de l'e-mail, qui varie d'un envoi à l'autre — la
 * même annonce se retrouvait sous deux références, donc en doublon.
 */
export function referenceFromUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const portal = PORTALS.find((candidate) => candidate.host.test(url.hostname));
  if (portal === undefined) return null;
  const reference = portal.reference(url);
  return reference === null ? null : `${portal.id}:${reference}`;
}

/** Localisation lue dans l'URL canonique d'une annonce. */
export interface UrlLocation {
  readonly cityText?: string;
  readonly postalCodeText?: string;
  readonly districtText?: string;
}

/**
 * Extrait la localisation du chemin de l'URL canonique.
 *
 * La moitié des digests ne nomment pas la commune, ce qui rendait ces annonces
 * incomparables au dédoublonnage (ses clés en sont préfixées). L'URL la porte
 * presque toujours, et fait autorité — on ne devine rien (§17).
 *
 *   …/appartement/nice-06/baumettes/…   → commune + quartier
 *   …/alpes-maritimes-06/nice-06000/…   → commune + code postal
 */
export function locationFromUrl(href: string): UrlLocation {
  let path: string;
  try {
    path = new URL(href).pathname;
  } catch {
    return {};
  }

  // « nice-06000 » (code postal complet) ou « nice-06 » (département seul).
  //
  // Le chemin peut en contenir PLUSIEURS : « /alpes-maritimes-06/nice-06000/ »
  // porte le département avant la commune. On préfère donc la forme à cinq
  // chiffres, et à défaut le dernier segment — le plus profond est le plus
  // précis. Prendre le premier rendait « alpes maritimes » comme ville.
  const matches = [...path.matchAll(/\/([a-z][a-z-]*?)-(\d{2}|\d{5})(?=\/)/g)];
  if (matches.length === 0) return {};
  const match = matches.find((m) => m[2]?.length === 5) ?? matches[matches.length - 1];
  if (match?.[1] === undefined) return {};
  const city = match[1].replace(/-/g, ' ');
  const code = match[2] ?? '';

  // Le segment qui suit immédiatement la commune est le quartier, quand il
  // n'est pas déjà l'identifiant de l'annonce (majuscules et chiffres).
  const after = path.slice((match.index ?? 0) + match[0].length + 1).split('/')[0] ?? '';
  const district =
    after !== '' && /^[a-z][a-z-]*$/.test(after) ? after.replace(/-/g, ' ') : undefined;

  return {
    cityText: city,
    ...(code.length === 5 ? { postalCodeText: code } : {}),
    ...(district !== undefined ? { districtText: district } : {}),
  };
}

export function parseAlertEmail(
  html: string,
  /**
   * COMPTEUR DES LIENS JETÉS, par hôte. Facultatif, mais c'est la seule façon
   * de savoir ce qu'on laisse passer : la table des portails n'en connaît que
   * trois, et tout le reste disparaissait sans une ligne de journal ni un
   * compteur — un portail pouvait envoyer des annonces pendant des mois sans
   * que rien ne le signale. Seuls les liens dont le TEXTE ressemble à un titre
   * d'annonce y entrent : un pied de page n'est pas une annonce perdue.
   */
  unknownHosts?: Map<string, number>,
): RawListing[] {
  const $ = cheerio.load(html);
  const bySourceRef = new Map<string, RawListing>();

  // Le nom de l'agence est écrit UNE fois, en tête du message : ces digests
  // d'exclusivité ne portent qu'une annonce, celle de l'agence qui écrit.
  const agencyName = findAgencyName($);

  $('a[href]').each((_i, el) => {
    const anchor = $(el);
    const title = cleanText(anchor.text().replace(/\s+/g, ' '));
    // Seul le lien-TITRE d'une annonce porte surface/typologie : point d'entrée
    // fiable pour délimiter un bloc (les liens image/prix sont ignorés ici).
    if (!/\bm²|pièces?\b|studio/i.test(title)) return;
    const href = anchor.attr('href') ?? '';
    const resolved = resolvePortalUrl(href);
    if (resolved === null) {
      const host = unknownHostOf(href);
      if (host !== null && unknownHosts !== undefined) {
        unknownHosts.set(host, (unknownHosts.get(host) ?? 0) + 1);
      }
      return;
    }

    const listing = buildFromTitle($, anchor, title, resolved, agencyName);
    if (listing !== null && !bySourceRef.has(listing.sourceRef)) {
      bySourceRef.set(listing.sourceRef, listing);
    }
  });

  return [...bySourceRef.values()];
}
