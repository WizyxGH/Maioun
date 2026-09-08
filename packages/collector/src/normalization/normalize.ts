/**
 * Normalisation : `RawListing` → `NormalizedListing` (§12).
 *
 * Le scraper extrait des chaînes ; la normalisation les transforme en données
 * typées et vérifiées. La séparation est stricte : aucun scraper ne fait de
 * parsing métier, et la normalisation ne connaît aucune particularité de site.
 * C'est ce qui permet d'ajouter une source sans toucher au reste (§47, §76).
 */

import type {
  Contact,
  LandlordKind,
  NormalizedListing,
  RawListing,
  SourceId,
} from '@maioun/shared';
import { EMPTY_CONTACT, SHORT_TERM_LEASE_FEATURE, STUDENT_HOUSING_FEATURE } from '@maioun/shared';
import { cleanText, comparable } from './text.js';
import {
  isShortTermStudentLease,
  isStudentOnlyHousing,
  looksLikeStreet,
  NUMBERED_STREET,
  parseArea,
  parseBedrooms,
  parseCharges,
  parseChargesField,
  parseChargesFromText,
  parseEmail,
  parseDistrictOf,
  parseDpe,
  parseFlatShare,
  parseFurnished,
  parseMaxOccupants,
  extractFeatures,
  staleTextFeatures,
  extractStreetAddress,
  parseAvailabilityInText,
  parseAvailableAt,
  parsePhone,
  parsePostalCode,
  parsePrice,
  parsePropertyType,
  parsePublishedAt,
  parseRooms,
} from './parse-listing-fields.js';
import { extractNumber } from './parse-number.js';

export interface NormalizeOptions {
  readonly sourceId: SourceId;
  /** Instant de la collecte, injecté pour la reproductibilité (§59). */
  readonly nowMs: number;
  /**
   * Date de première observation si l'annonce est déjà connue.
   * Absente pour une annonce nouvellement découverte.
   */
  readonly firstSeenAt?: string;
  /**
   * La nature des bailleurs de la source, quand elle est certaine — c'est le
   * `landlord` de son descripteur. Elle tranche pour les annonces où le texte
   * ne dit rien, ce qui est le cas de la plupart : les digests de portails ne
   * portent aucune description.
   */
  readonly landlord?: LandlordKind;
}

/** Identifiant stable et lisible d'une occurrence. */
export function occurrenceId(sourceId: SourceId, sourceRef: string): string {
  return `${sourceId}:${sourceRef}`;
}

/** Signes FORTS qu'un bien est à vendre (et non à louer). */
const SALE_MARKERS =
  /\bà vendre\b|\bprix de vente\b|\bfrais de notaire\b|\bhonoraires? (à la )?charge (de l')?acqu[eé]reur\b|\bviager\b|\bà l['e ]achat\b|\bnos biens à vendre\b/;
/** Signes qu'il s'agit bien d'une location (priment sur une ambiguïté). */
const RENTAL_MARKERS =
  /\bà louer\b|\blocation\b|\bloyer\b|\/mois\b|\bmensuel\b|\bbail\b|\bcaution\b/;

/**
 * `true` si l'annonce est clairement une VENTE. On combine titre, description
 * et URL, et on n'exclut que si un marqueur de vente est présent SANS marqueur
 * de location — mieux vaut garder une location douteuse que jeter un vrai bien.
 */
function isForSale(raw: RawListing): boolean {
  const text = comparable(
    `${raw.title ?? ''} ${raw.description ?? ''} ${raw.propertyTypeText ?? ''}`,
  );
  const url = comparable(raw.sourceUrl ?? '');
  // Une URL de vente explicite (/vente/, /acheter/, /achat/) suffit.
  if (/\bvente\b|\bacheter\b|\bachat\b/.test(url) && !/\blocation\b|\blouer\b/.test(url)) {
    return true;
  }
  return SALE_MARKERS.test(text) && !RENTAL_MARKERS.test(text);
}

function toNull(value: string | undefined): string | null {
  const cleaned = cleanText(value);
  return cleaned === '' ? null : cleaned;
}

/**
 * Déduit la nature du bailleur.
 *
 * TROIS INDICES, DU PLUS SÛR AU PLUS FAIBLE. Une agence nommée tranche. Le mot
 * « particulier » dans le texte tranche aussi. Reste ce que dit LA SOURCE
 * elle-même : PAP ne publie que du particulier à particulier, et c'est un fait
 * sur la source, pas une supposition sur l'annonce.
 *
 * CE TROISIÈME INDICE MANQUAIT, et son absence rendait le filtre « particuliers
 * seuls » inopérant : sur mille cent fiches, aucune n'était classée
 * particulier. Le mot ne pouvait pas se trouver — les deux tiers des annonces
 * viennent des digests de portails, qui n'ont aucune description à fouiller.
 *
 * Sans aucun indice, on reste sur `unknown` plutôt que de supposer (§17), et le
 * filtre laisse alors passer.
 */
function inferLandlordKind(raw: RawListing, sourceLandlord?: LandlordKind): LandlordKind {
  /**
   * UNE SOURCE QUI LE DIT PRIME SUR TOUT LE RESTE. Bien'ici publie le type de
   * compte du déposant ; c'est la première fois qu'une source du projet fait
   * la différence explicitement, au lieu de la laisser deviner dans une prose
   * que les deux tiers des annonces n'ont pas.
   */
  const declared = raw.extra?.['landlord'];
  if (declared === 'agency' || declared === 'private') return declared;

  if (toNull(raw.agencyName) !== null) return 'agency';
  const haystack = comparable(`${raw.title ?? ''} ${raw.description ?? ''}`);
  if (/\bparticulier\b|\bde particulier a particulier\b/.test(haystack)) return 'private';
  return sourceLandlord ?? 'unknown';
}

/** Construit les coordonnées à partir des champs bruts (§21). */
function buildContact(raw: RawListing, sourceId: SourceId, landlord?: LandlordKind): Contact {
  const phone = parsePhone(raw.phoneText);
  const email = parseEmail(raw.emailText);
  const agencyName = toNull(raw.agencyName);
  const name = toNull(raw.contactName);
  const formUrl = toNull(raw.contactFormUrl);
  const reference = toNull(raw.extra?.['reference']) ?? raw.sourceRef;

  const hasAny =
    phone !== null || email !== null || agencyName !== null || name !== null || formUrl !== null;

  return {
    ...EMPTY_CONTACT,
    name,
    agencyName,
    phone,
    email,
    formUrl,
    reference,
    kind: inferLandlordKind(raw, landlord),
    providedBy: hasAny ? [sourceId] : [],
  };
}

/**
 * Nettoie une adresse où la source a collé DEUX voies dans un même champ.
 *
 * Deux formes rencontrées, et une seule réponse :
 *
 *   « Rue Edouard Scoffier 28 Rue Edouard Scoffier »          (voie répétée)
 *   « Rue de l'Industrie 17 rue des Comptoirs du Littoral »   (voies distinctes)
 *
 * Dans les deux cas on garde la moitié NUMÉROTÉE. Un numéro de voie ne s'écrit
 * pas par hasard : c'est l'adresse du bien. Le préfixe sans numéro est du
 * contexte — un angle de rues, un secteur, ou la voie de l'agence elle-même,
 * comme dans le JSON-LD de climmo relevé le 2026-09-04, dont la description
 * confirmait « 17 rue des Comptoirs du Littoral ».
 *
 * Le collage laissait une adresse qu'aucun géocodeur ne retrouve : ni point sur
 * la carte, ni temps de trajet (§20).
 *
 * PRUDENCE : la moitié conservée doit elle-même commencer par un numéro SUIVI
 * d'un type de voie. « Rue de la Paix 12 » n'est pas deux adresses, et reste
 * intacte (§17).
 */
/**
 * Les atouts après rejeu : ce qui s'ajoute, et ce qu'il faut retirer.
 *
 * CE QU'ON AJOUTE : seulement les deux atouts qui se lisent ENTIÈREMENT dans le
 * texte conservé en base — bail de neuf mois, logement étudiant. Les autres
 * viennent d'attributs bruts que la base n'a pas gardés, et les recalculer les
 * perdrait.
 *
 * CE QU'ON RETIRE : les erreurs de l'ancienne détection, qui se contentait de
 * chercher le mot. « SANS ascenseur » posait « Ascenseur », « à deux pas du
 * Jardin Albert Ier » posait « Jardin ». Les fiches déjà en base gardent ces
 * erreurs — une occurrence que sa source ne modifie plus n'est jamais
 * renormalisée, donc elles ne partiraient jamais d'elles-mêmes.
 *
 * `staleTextFeatures` ne retire QUE ce dont le mot figure dans le texte : un
 * atout venu d'un attribut absent de la base n'est pas touché. C'est ce qui
 * permet de nettoyer sans rien perdre.
 *
 * Extraite de `rederiveFromText`, que ces deux listes poussaient au-delà du
 * seuil de complexité du dépôt (§75).
 */
function reconcileFeatures(
  current: readonly string[],
  text: string,
): { features: readonly string[]; changed: boolean } {
  const gained = [
    ...(isShortTermStudentLease(text) ? [SHORT_TERM_LEASE_FEATURE] : []),
    ...(isStudentOnlyHousing(text) ? [STUDENT_HOUSING_FEATURE] : []),
  ].filter((feature) => !current.includes(feature));
  const lost = staleTextFeatures(current, text);

  if (gained.length === 0 && lost.length === 0) return { features: current, changed: false };
  return {
    features: [...current.filter((one) => !lost.includes(one)), ...gained],
    changed: true,
  };
}

export function dedupeStreetAddress(address: string | null): string | null {
  if (address === null) return null;
  const clean = address.replace(/\s+/g, ' ').trim();
  // « <voie sans n°> <n° + voie> » : découpe au premier numéro interne.
  const match = clean.match(/^(.+?)\s+(\d+\b.*)$/);
  const tail = match?.[2];
  if (match?.[1] === undefined || tail === undefined) return clean;
  return NUMBERED_STREET.test(tail) ? tail : clean;
}

/** Localisation résolue depuis les multiples champs bruts possibles (§14, §20). */
function resolveLocation(raw: RawListing): {
  address: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
} {
  return {
    /**
     * Adresse : champ dédié, sinon repérée en tête de description (« 22-24
     * Avenue… » — beaucoup d'agences l'y mettent en première ligne), sinon dans
     * le titre. Nettoyée des voies saisies en double par certaines sources.
     *
     * LE TITRE EST NOUVEAU, et plusieurs agences n'écrivent la voie que là :
     * « STUDIO VIDE - 1 BIS AV PATRIMOINE - NICE GORBELLA », « 2 PIÈCES
     * MEUBLÉ - 71 BD DELFINO ». On ne la cherchait que dans la description :
     * ces annonces n'avaient donc aucune adresse — ni point sur la carte, ni
     * les trente points que le dédoublonnage accorde à une adresse commune.
     *
     * L'extracteur exige un TYPE DE VOIE (rue, avenue, boulevard, BD, AV) : un
     * titre qui ne nomme qu'un quartier — « STUDIO SAINT SYLVESTRE » — ne rend
     * donc rien, ce qui est la bonne réponse. Deux studios du même quartier ne
     * sont pas le même studio.
     */
    address: dedupeStreetAddress(
      toNull(raw.addressText) ??
        extractStreetAddress(raw.description) ??
        extractStreetAddress(raw.title),
    ),
    // Quartier/secteur si la source le publie (ex. Orpi `extra.quartier`).
    // Champ dédié d'abord — neuf sources sur quarante le remplissent —, puis
    // le texte, où la tournure « quartier X » se désigne elle-même.
    district: toNull(raw.extra?.['quartier']) ?? parseDistrictOf(raw.title, raw.description),
    // Ville en forme comparable : les filtres et le dédoublonnage ignorent
    // ainsi casse et accents.
    city: raw.cityText !== undefined ? comparable(raw.cityText) || null : null,
    postalCode:
      parsePostalCode(raw.postalCodeText) ??
      parsePostalCode(raw.addressText) ??
      parsePostalCode(raw.cityText),
    latitude: Number.isFinite(raw.latitude) ? (raw.latitude ?? null) : null,
    longitude: Number.isFinite(raw.longitude) ? (raw.longitude ?? null) : null,
  };
}

/** Surface : champ dédié, sinon repérée dans le titre ou la description. */
function resolveArea(raw: RawListing): number | null {
  return parseArea(raw.areaText) ?? parseArea(raw.title) ?? parseArea(raw.description);
}

/** DPE cherché dans les champs où les sources le publient. */
function resolveDpe(raw: RawListing): NormalizedListing['dpe'] {
  return (
    parseDpe(raw.extra?.['dpe']) ??
    parseDpe(raw.title) ??
    parseDpe(raw.description) ??
    parseDpe(raw.extra?.['features'])
  );
}

/**
 * Disponibilité : champ dédié d'abord, sinon repérée dans le titre ou la
 * description.
 *
 * LE CHAMP DÉDIÉ EST CRU SUR PAROLE — « Libre » y veut dire maintenant. Le
 * texte libre, non : le mot s'y promène, et `parseAvailabilityInText` n'y
 * retient une date que si la phrase en porte une.
 */
function resolveAvailability(raw: RawListing, nowMs: number): string | null {
  return (
    parseAvailableAt(raw.availableAtText, nowMs) ??
    parseAvailabilityInText(`${raw.title ?? ''}. ${raw.description ?? ''}`, nowMs)
  );
}

/**
 * Les textes libres d'une annonce brute, recousus une fois pour toutes.
 *
 * Chaque champ dérivé se lit dans plusieurs cases à la fois : le type se
 * devine autant dans le titre que dans le libellé de type, le meublé autant
 * dans la description que dans la liste d'équipements. Assembler ces sources
 * ici plutôt qu'à chaque appel évite d'éparpiller vingt `?? ''` dans le corps
 * de `normalizeListing`, qui n'y gagnait que du bruit.
 */
function textSources(raw: RawListing): {
  type: string;
  furnished: string;
  rooms: string;
  bedrooms: string;
  features: string;
  prose: string;
} {
  const title = raw.title ?? '';
  const description = raw.description ?? '';
  const roomsText = raw.roomsText ?? '';
  const extraFeatures = raw.extra?.['features'] ?? '';
  const type = `${raw.propertyTypeText ?? ''} ${title}`;
  return {
    type,
    furnished: `${raw.furnishedText ?? ''} ${extraFeatures} ${description}`,
    rooms: `${roomsText} ${title}`,
    bedrooms: `${roomsText} ${extraFeatures}`,
    features: `${title} ${description} ${raw.furnishedText ?? ''} ${extraFeatures}`,
    prose: `${title} ${description}`,
  };
}

/**
 * Transforme une annonce brute en annonce normalisée.
 *
 * @returns l'annonce normalisée, ou `null` si elle est inexploitable —
 *          c'est-à-dire sans URL ou sans référence stable, auquel cas on ne
 *          saurait ni la dédoublonner ni la retrouver.
 */
export function normalizeListing(
  raw: RawListing,
  options: NormalizeOptions,
): NormalizedListing | null {
  const sourceUrl = cleanText(raw.sourceUrl);
  const sourceRef = cleanText(raw.sourceRef);
  if (sourceUrl === '' || sourceRef === '') return null;

  // §3 : on ne veut QUE des locations. Les sources ciblent déjà des pages de
  // location, mais si l'une laisse passer un bien À VENDRE, on l'écarte
  // totalement (pas seulement « hors critères »). Prudence : on n'exclut que
  // sur un signe FORT de vente ET en l'absence de tout signe de location, pour
  // ne jamais jeter une vraie location par erreur (§17).
  if (isForSale(raw)) return null;

  const nowIso = new Date(options.nowMs).toISOString();
  const price = parsePrice(raw.priceText);
  const text = textSources(raw);
  const location = resolveLocation(raw);

  return {
    id: occurrenceId(options.sourceId, sourceRef),
    sourceId: options.sourceId,
    sourceRef,
    sourceUrl,

    title: toNull(raw.title),
    description: toNull(raw.description),

    price: price.amount,
    // Trois sources, de la plus explicite à la plus indirecte. La description
    // n'est consultée qu'en dernier — mais elle porte le montant dans deux
    // cent trente-quatre annonces sur mille, là où le champ dédié est vide.
    charges:
      parseChargesField(raw.chargesText) ??
      parseCharges(raw.priceText) ??
      parseChargesFromText(text.prose, price.amount),
    chargesIncluded: price.chargesIncluded,
    area: resolveArea(raw),
    rooms: parseRooms(text.rooms),
    bedrooms: parseBedrooms(text.bedrooms),
    propertyType: parsePropertyType(text.type),
    furnished: parseFurnished(text.furnished),
    flatShare: parseFlatShare(`${text.type} ${raw.description ?? ''}`, raw.title),
    dpe: resolveDpe(raw),
    // Publié en toutes lettres dans la description des meublés courte durée.
    maxOccupants: parseMaxOccupants(text.prose),
    features: extractFeatures(text.features, raw.extra),

    // Localisation : décisive pour la distance (§20) et le dédoublonnage (§14).
    address: location.address,
    district: location.district,
    city: location.city,
    postalCode: location.postalCode,
    latitude: location.latitude,
    longitude: location.longitude,

    contact: buildContact(raw, options.sourceId, options.landlord),

    publishedAt: parsePublishedAt(raw.publishedAtText, options.nowMs),
    availableAt: resolveAvailability(raw, options.nowMs),

    // §11 : uniquement des URLs distantes, jamais de téléchargement.
    imageUrls: [...(raw.imageUrls ?? [])].filter((url) => url.startsWith('http')),

    // §17 : `null` signifie « la source ne publie pas cette information ».
    views: extractNumber(raw.viewsText, { min: 0, max: 10_000_000 }),
    favorites: extractNumber(raw.favoritesText, { min: 0, max: 1_000_000 }),

    firstSeenAt: options.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
    scrapedAt: nowIso,
    lifecycle: 'active',
  };
}

/**
 * Champs que le rattrapage remplit UNIQUEMENT quand ils sont vides
 * (règles 4 à 7).
 *
 * Séparés du reste parce qu'ils obéissent tous à la même loi — le silence se
 * remplit, une valeur publiée ne bouge pas — et parce que les garder en ligne
 * dans `rederiveFromText` faisait passer celle-ci au-dessus du seuil de
 * complexité toléré.
 */
function fillGaps(
  occurrence: NormalizedListing,
  text: string,
  nowMs: number,
): Pick<
  NormalizedListing,
  | 'flatShare'
  | 'charges'
  | 'rooms'
  | 'dpe'
  | 'district'
  | 'maxOccupants'
  | 'furnished'
  | 'availableAt'
> {
  return {
    // Le TITRE est transmis à part : « Chambre meublée à Nice nord » loue une
    // chambre, et on ne loue une chambre seule que dans un logement partagé.
    // Noyé dans la description, ce signal se perdait.
    flatShare:
      occurrence.flatShare === null && parseFlatShare(text, occurrence.title) === true
        ? true
        : occurrence.flatShare,
    /**
     * LE NOMBRE D'OCCUPANTS MANQUAIT ICI, et c'est ce qui le rendait
     * irrattrapable : il se lit entièrement dans le texte conservé — « idéal
     * pour 3 colocataires » —, donc exactement ce que ce rejeu sait faire, mais
     * personne ne le recalculait. Les fiches déjà en base restaient à ce que
     * l'extraction savait le jour de leur collecte.
     */
    maxOccupants:
      occurrence.maxOccupants === null ? parseMaxOccupants(text) : occurrence.maxOccupants,
    // Bornées par le loyer quand il est connu : au-delà, ce n'est pas une
    // provision de charges mais un loyer qu'une tournure a laissé passer.
    charges:
      occurrence.charges === null
        ? parseChargesFromText(occurrence.description, occurrence.price)
        : occurrence.charges,
    // Les pièces se lisent dans le TITRE : « une pièce à vivre » d'une
    // description est le séjour d'un trois-pièces, pas le logement entier.
    rooms: occurrence.rooms === null ? parseRooms(occurrence.title) : occurrence.rooms,
    dpe: occurrence.dpe === null ? parseDpe(occurrence.description) : occurrence.dpe,
    district:
      occurrence.district === null
        ? parseDistrictOf(occurrence.title, occurrence.description)
        : occurrence.district,
    /**
     * LE MEUBLÉ MANQUAIT ICI, et le manque se voyait dans les chiffres : sur
     * huit annonces dont la description dit « location vide », une restait sans
     * statut. La cause n'est pas la détection — elle reconnaît la tournure —
     * mais le TEXTE qu'on lui donne : chaque source décide de ce qu'elle passe,
     * et celles qui ne joignent pas la description ne laissent rien à lire.
     *
     * Le rejeu, lui, dispose du texte conservé en entier. C'est exactement ce
     * qu'il est fait pour rattraper.
     */
    furnished: occurrence.furnished === null ? parseFurnished(text) : occurrence.furnished,
    /**
     * LA DISPONIBILITÉ MANQUAIT ICI AUSSI, et pour la même raison : la
     * détection s'est améliorée après coup. Deux tiers des annonces n'avaient
     * aucune date, alors que leur description en portait une — « DISPONIBLE LE
     * 1 ER OCTOBRE », « BAIL A L ANNEE LIBRE DE SUITE ». Sans ce rattrapage,
     * le filtre « disponible au plus tard le… » n'aurait rien eu à filtrer
     * avant la prochaine visite de chaque source, c'est-à-dire jamais pour
     * celles qui ne rendent visite qu'aux annonces inconnues.
     */
    availableAt:
      occurrence.availableAt === null
        ? parseAvailabilityInText(text, nowMs)
        : occurrence.availableAt,
  };
}

/**
 * Rejoue sur une occurrence DÉJÀ EN BASE ce que la normalisation sait faire
 * aujourd'hui de son texte (§12).
 *
 * Sert au rattrapage : quand l'extraction s'améliore, les annonces déjà
 * collectées ne repassent pas par un scraper — leur texte est en base, mais la
 * valeur qu'on savait en tirer date du jour de la collecte. Sans ce rejeu, une
 * amélioration ne profitait qu'aux annonces futures.
 *
 * VOLONTAIREMENT MINIMALISTE — trois règles seulement :
 *
 *   1. l'adresse n'est REMPLIE que si elle manque : une adresse publiée par la
 *      source fait autorité sur une adresse lue dans un texte. Elle est en
 *      revanche EFFACÉE si elle n'en est manifestement pas une — « 10 Avenue
 *      Sainte-MargueriteAu sein d'une résidence » a mordu sur la phrase
 *      suivante, et reste faux quelle qu'en soit la provenance (§17) ;
 *   2. le TYPE n'est corrigé que dans UN SENS : un « parking » que le titre
 *      dément. Un parking mentionné comme atout a longtemps fait classer
 *      « parking » des logements entiers, donc écartés de la recherche sans
 *      trace (§16). L'inverse — recalculer librement — dégraderait des fiches
 *      justes, le titre ne nommant pas toujours le type ;
 *   3. les atouts ne sont qu'AUGMENTÉS. Les recalculer entièrement les
 *      appauvrirait : plusieurs viennent des attributs bruts du scraper
 *      (étage, ascenseur, nombre de balcons) que la base ne conserve pas ;
 *   4. la COLOCATION ne se pose que sur un `null`. Un `false` en base vient
 *      d'une source qui a dit « colocation possible » — le logement est
 *      entier —, et un `true` n'a aucune raison d'être défait. Seul le silence
 *      se remplit (§17) ;
 *   5. les CHARGES aussi ne se posent que sur un `null`, et seulement si elles
 *      restent sous le loyer. Une source qui publie un montant fait autorité
 *      sur une phrase ;
 *   6. le NOMBRE DE PIÈCES et le DPE, même règle du silence. Ils sont lus
 *      dans le titre et la description — « DEUX PIECES MEUBLEES », « Classe
 *      énergétique (kWh/m²/an) C » —, deux formes que l'extraction ne savait
 *      pas lire et qui laissaient cinquante-neuf et cinquante-cinq annonces
 *      du bulletin abonné sans ces valeurs, pourtant écrites ;
 *   7. le QUARTIER, idem : « quartier Riquier » le nomme sans ambiguïté, et
 *      c'est lui qui place la punaise quand la rue manque (§20).
 *
 * Rien d'autre n'est retouché : ni le cycle de vie, ni le quartier, dont la
 * valeur correcte n'est pas reconstituable depuis le texte (§17).
 *
 * @returns l'occurrence corrigée, ou `null` si rien ne change.
 */
export function rederiveFromText(
  occurrence: NormalizedListing,
  nowMs: number = Date.now(),
): NormalizedListing | null {
  const text = `${occurrence.title ?? ''} ${occurrence.description ?? ''}`;

  // Le TITRE aussi, comme à la normalisation : c'est là que plusieurs agences
  // écrivent la voie, et le rejeu doit rattraper celles collectées avant.
  const fromText = dedupeStreetAddress(
    extractStreetAddress(occurrence.description) ?? extractStreetAddress(occurrence.title),
  );
  const address =
    occurrence.address !== null && looksLikeStreet(occurrence.address)
      ? occurrence.address
      : fromText;

  // Le type ne se corrige que DANS UN SENS : un « parking » que le titre
  // dément. Le recalculer librement le dégraderait — le scraper le tenait
  // souvent d'un champ dédié que la base ne conserve pas, et le titre seul
  // rendait alors « other » là où « appartement » était juste (§17).
  const rescued = parsePropertyType(occurrence.title);
  const propertyType =
    occurrence.propertyType === 'parking' &&
    rescued !== 'parking' &&
    rescued !== 'other' &&
    rescued !== 'unknown'
      ? rescued
      : occurrence.propertyType;

  const { features, changed: featuresChanged } = reconcileFeatures(occurrence.features, text);

  const filled = fillGaps(occurrence, text, nowMs);
  const { flatShare, charges, rooms, dpe, district, maxOccupants, furnished, availableAt } = filled;

  if (
    address === occurrence.address &&
    propertyType === occurrence.propertyType &&
    !featuresChanged &&
    flatShare === occurrence.flatShare &&
    charges === occurrence.charges &&
    rooms === occurrence.rooms &&
    dpe === occurrence.dpe &&
    district === occurrence.district &&
    maxOccupants === occurrence.maxOccupants &&
    furnished === occurrence.furnished &&
    availableAt === occurrence.availableAt
  ) {
    return null;
  }
  return {
    ...occurrence,
    address,
    propertyType,
    features,
    flatShare,
    charges,
    rooms,
    dpe,
    district,
    maxOccupants,
    furnished,
    // À NE PAS OUBLIER ICI. Le champ décide du retour — il figure dans la
    // comparaison ci-dessus — mais s'il manque de l'objet rendu, le `...occurrence`
    // en tête réinstalle l'ancienne valeur : le rejeu annonce alors une
    // correction, l'écrit à l'identique, et la réannonce au passage suivant.
    // Vingt-six occurrences ont tourné ainsi, sans jamais bouger.
    availableAt,
  };
}

/** Normalise un lot, en écartant silencieusement les annonces inexploitables. */
export function normalizeAll(
  raws: readonly RawListing[],
  options: NormalizeOptions,
): NormalizedListing[] {
  const results: NormalizedListing[] = [];
  for (const raw of raws) {
    const normalized = normalizeListing(raw, options);
    if (normalized !== null) results.push(normalized);
  }
  return results;
}
