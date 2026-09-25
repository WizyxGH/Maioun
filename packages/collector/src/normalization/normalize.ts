/**
 * Normalisation : `RawListing` → `NormalizedListing` (§12).
 *
 * Le scraper extrait des chaînes ; la normalisation les transforme en données
 * typées et vérifiées. La séparation est stricte : aucun scraper ne fait de
 * parsing métier, et la normalisation ne connaît aucune particularité de site.
 * C'est ce qui permet d'ajouter une source sans toucher au reste (§47, §76).
 */

import type {
  ApplicationStatus,
  Contact,
  LandlordKind,
  NormalizedListing,
  RawListing,
  SourceId,
} from '@maioun/shared';
import {
  EMPTY_CONTACT,
  rentExcludingCharges,
  SHORT_TERM_LEASE_FEATURE,
  STUDENT_HOUSING_FEATURE,
} from '@maioun/shared';
import { cleanMultiline, cleanText, comparable } from './text.js';
import { communeWithPostalCode, plausibleCommune } from './commune.js';
import { wantedAdEvidence } from './housing-wanted.js';
import {
  addressGrade,
  isShortPeriodPrice,
  isShortTermStudentLease,
  isStudentOnlyHousing,
  looksLikeStreet,
  NUMBERED_STREET,
  parseArea,
  parseBedrooms,
  parseCharges,
  parseChargesField,
  parseChargesFromText,
  parseDepositField,
  parseDepositFromText,
  parseFeesField,
  parseFeesFromText,
  parseEmail,
  parseDistrictOf,
  parseDpe,
  parseGes,
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
  parsePublishedReference,
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
  /**
   * `true` quand la source laisse des DEMANDES de logement se publier parmi ses
   * offres — c'est le drapeau du descripteur. Ailleurs, une formulation de
   * demande est signalée mais l'annonce reste : le risque d'écarter une vraie
   * offre pèse plus lourd que celui d'en laisser passer une fausse.
   */
  readonly hostsWantedAds?: boolean;
  /**
   * Prévenu pour CHAQUE annonce reconnue comme une demande, retirée ou non,
   * avec la formulation qui l'a désignée. Rien ne disparaît en silence.
   */
  readonly onWantedAd?: (raw: RawListing, evidence: string, excluded: boolean) => void;
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

/** `toNull` pour un texte long : les retours à la ligne de la source restent. */
function toNullMultiline(value: string | undefined): string | null {
  const cleaned = cleanMultiline(value);
  return cleaned === '' ? null : cleaned;
}

/**
 * La COLOCATION telle que la source la déclare, ou `null` si elle n'en dit rien.
 *
 * `parseFlatShare` fouille un titre et une prose : c'est la seule ressource
 * quand la source ne classe rien. Mais MorningCroissant range chaque annonce
 * dans « Logement entier », « Chambre privée » ou « Chambre partagée », et
 * Appartager ne publie QUE des colocations — le deviner à partir du texte
 * serait retomber sur une heuristique là où le fait est écrit.
 *
 * L'ENJEU EST UNE EXCLUSION. Ce compte écarte les colocations
 * (`excludeFlatShare`) : une chambre partagée qui ressort `null` passe le
 * filtre et part en alerte. On prend donc la déclaration de la source telle
 * quelle, comme on le fait déjà pour `landlord` juste en dessous.
 */
function declaredFlatShare(raw: RawListing): boolean | null {
  const declared = raw.extra?.['flatShare'];
  if (declared === 'true') return true;
  if (declared === 'false') return false;
  return null;
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
  /**
   * LA RÉFÉRENCE EST CELLE QUE L'AGENCE PUBLIE, ou rien.
   *
   * Un repli sur `sourceRef` traînait ici, et la fiche affichait « Réf. agence :
   * 565 » — un numéro que nous avions fabriqué depuis l'URL, que personne ne
   * reconnaissait au téléphone. Sur les occurrences actives, les trois quarts
   * portaient ainsi un identifiant interne présenté comme une référence.
   *
   * Un champ absent reste absent (§17). Le rapprochement, lui, ne perd rien :
   * il compare désormais les identifiants de source explicitement, au lieu de
   * les faire passer pour des références (voir `identifiers` dans
   * `deduplication/similarity.ts`).
   */
  const reference = toNull(raw.extra?.['reference']);

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
      // LE CHAMP DÉDIÉ NE GAGNE PLUS D'OFFICE. Il l'emportait toujours, et
      // laissait donc passer « avenue Sainte Colette » quand la description
      // porte « 31, avenue Sainte Colette », ou « Californie, Nice » — un
      // quartier — sur une vraie voie. `bestAddress` compare leur précision.
      bestAddress(
        ...cleanAddresses(
          toNull(raw.addressText),
          extractStreetAddress(raw.description) ?? extractStreetAddress(raw.title),
          {
            city: raw.cityText ?? null,
            postalCode:
              parsePostalCode(raw.postalCodeText) ??
              parsePostalCode(raw.addressText) ??
              parsePostalCode(raw.cityText),
            text: `${raw.title ?? ''} ${raw.description ?? ''}`,
          },
        ),
      ),
    ),
    // Quartier/secteur si la source le publie (ex. Orpi `extra.quartier`).
    // Champ dédié d'abord — neuf sources sur quarante le remplissent —, puis
    // le texte, où la tournure « quartier X » se désigne elle-même.
    district: toNull(raw.extra?.['quartier']) ?? parseDistrictOf(raw.title, raw.description),
    /**
     * Ville en forme comparable : les filtres et le dédoublonnage ignorent
     * ainsi casse et accents.
     *
     * CE QUI N'EST PAS UNE COMMUNE N'EN DEVIENT PAS UNE ICI. Le champ récolte
     * ce qui traîne autour du code postal : un digest y a mis le libellé de son
     * bouton — « voir l annonce » sur vingt-trois occurrences —, une autre
     * source « a 17 km de nice ». Refusé, le champ reste vide : une commune
     * absente se cherche, une commune fausse s'affiche comme une adresse.
     */
    city: plausibleCommune(raw.cityText),
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

/** GES cherché aux mêmes endroits que le DPE, jamais déduit de lui. */
function resolveGes(raw: RawListing): NormalizedListing['ges'] {
  return (
    parseGes(raw.extra?.['ges']) ??
    parseGes(raw.title) ??
    parseGes(raw.description) ??
    parseGes(raw.extra?.['features'])
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

/** État de candidature posé par le scraper ; toute autre valeur vaut « inconnu ». */
function parseApplicationStatus(value: string | undefined): ApplicationStatus | null {
  return value === 'open' || value === 'full' ? value : null;
}

/**
 * Un titre qui NOMME un parking : « BOX HAUT MALAUSSENA », « Le Fenice - Garage
 * à louer », « Cave 5 m² ». La catégorie de la source disait « appartement »
 * (relevé du 2026-09-14). En tête de titre ou suivi de « à louer », sans
 * logement nommé et sur une petite surface : « Studio avec parking à louer » et
 * « 3P garage » restent des logements.
 */
function parkingByTitle(
  title: string | null | undefined,
  area: number | null,
  rooms: number | null,
  sourceUrl: string | null | undefined,
): boolean {
  if (/\/a-louer-(?:garage|parking)\b/i.test(sourceUrl ?? '')) return true;
  const text = comparable(`${title ?? ''} ${sourceUrl ?? ''}`);
  if (!PARKING_TITLE.test(text) || parsePropertyType(text) !== 'parking') return false;
  return (area === null || area <= 25) && (rooms === null || rooms <= 1);
}

const PARKING_TITLE =
  /^(?:location\s+|a louer\s+)?(?:box|garage|parking|stationnement|caves?|cellier|place de (?:parking|stationnement))\b|\b(?:box|garage|parking) a louer\b/;

/**
 * Un titre qui NOMME un bien commercial : « Location local commercial Nice
 * Joffre », « Louer commerce de 2 pièces 68 m² ». « pièces », ou la catégorie
 * « appartement » de la source, l'emportait : huit biens commerciaux passaient
 * pour des logements (relevé du 2026-09-14). Formes explicites seulement —
 * « 3 pièces avec bureau » reste un logement.
 */
export function commercialByTitle(
  title: string | null | undefined,
  /** `true` : formules sans ambiguïté seulement (« Location Bureau » est exclue). */
  strict = false,
): boolean {
  const text = comparable(title ?? '');
  if (COMMERCIAL_TITLE_STRICT.test(text)) return true;
  return !strict && COMMERCIAL_TITLE_LOOSE.test(text);
}

const COMMERCIAL_TITLE_STRICT =
  /\b(?:locaux? commerciaux?|local commercial|local professionnel|locaux? d activite|bail commercial|bail professionnel|fonds de commerce|droit au bail|murs commerciaux|pas de porte)\b/;

const COMMERCIAL_TITLE_LOOSE =
  /^(?:a )?(?:location|louer)\s+(?:de\s+)?(?:commerce|bureaux?|local)\b|^(?:commerce|bureaux?|local)\b|\b(?:commerce|bureaux?) a louer\b/;

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
  // Tarif à la nuit ou à la semaine : location de vacances, pas un loyer au
  // mois. Écartée ici pour toutes les sources, plutôt que parseur par parseur.
  if (isShortPeriodPrice(raw.priceText)) return null;

  const nowIso = new Date(options.nowMs).toISOString();
  const area = resolveArea(raw);
  const price = parsePrice(raw.priceText, { area });
  const text = textSources(raw);
  const location = resolveLocation(raw);
  // Trois sources, de la plus explicite à la plus indirecte. La description
  // n'est consultée qu'en dernier — mais elle porte le montant dans deux
  // cent trente-quatre annonces sur mille, là où le champ dédié est vide.
  const charges =
    parseChargesField(raw.chargesText) ??
    parseCharges(raw.priceText) ??
    parseChargesFromText(text.prose, price.amount);

  return {
    id: occurrenceId(options.sourceId, sourceRef),
    sourceId: options.sourceId,
    sourceRef,
    sourceUrl,

    title: toNull(raw.title),
    // Les sources gardent les paragraphes ; les aplatir ici rendait toute
    // description d'un seul bloc sur la fiche.
    description: toNullMultiline(raw.description),

    price: price.amount,
    charges,
    chargesIncluded: price.chargesIncluded,
    deposit:
      parseDepositField(raw.depositText, price.amount) ??
      parseDepositFromText(
        text.prose,
        price.amount,
        rentExcludingCharges({
          price: price.amount,
          charges,
          chargesIncluded: price.chargesIncluded,
        }),
      ),
    tenantFees:
      parseFeesField(raw.feesText, price.amount) ?? parseFeesFromText(text.prose, price.amount),
    area,
    rooms: parseRooms(text.rooms),
    bedrooms: parseBedrooms(text.bedrooms),
    propertyType: commercialByTitle(raw.title)
      ? 'commercial'
      : parkingByTitle(raw.title, area, parseRooms(text.rooms), raw.sourceUrl)
        ? 'parking'
        : parsePropertyType(text.type),
    // Le titre d'abord : « 3 PIÈCES MEUBLÉ » l'emporte sur une case « non »
    // de la source, que plusieurs agences laissent à sa valeur par défaut.
    furnished: parseFurnished(raw.title) ?? parseFurnished(text.furnished),
    flatShare:
      declaredFlatShare(raw) ??
      // La description à part : sa PREMIÈRE LIGNE est l'intitulé de l'annonceur
      // quand le titre vient d'un gabarit de portail.
      parseFlatShare(`${text.type} ${raw.description ?? ''}`, raw.title, raw.description),
    dpe: resolveDpe(raw),
    ges: resolveGes(raw),
    /**
     * LE LOYER PRÉCÉDENT, quand la source l'annonce. Il passe par le même
     * lecteur que le loyer courant : le digest l'écrit « 750 € », et l'accepter
     * brut ferait entrer une chaîne là où l'on attend un nombre.
     */
    previousPrice: parsePrice(toNull(raw.extra?.['previousPrice']) ?? undefined).amount,
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

    // Même règle pour la vidéo : l'adresse du lecteur chez la source, rien de plus.
    videoUrl: raw.videoUrl !== undefined && raw.videoUrl.startsWith('http') ? raw.videoUrl : null,

    // §17 : `null` signifie « la source ne publie pas cette information ».
    views: extractNumber(raw.viewsText, { min: 0, max: 10_000_000 }),
    favorites: extractNumber(raw.favoritesText, { min: 0, max: 1_000_000 }),
    applicationStatus: parseApplicationStatus(raw.extra?.['applicationStatus']),

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
  | 'deposit'
  | 'tenantFees'
  | 'rooms'
  | 'dpe'
  | 'ges'
  | 'district'
  | 'maxOccupants'
  | 'furnished'
  | 'availableAt'
> {
  const charges =
    occurrence.charges === null
      ? parseChargesFromText(occurrence.description, occurrence.price)
      : occurrence.charges;
  return {
    // Le TITRE est transmis à part : « Chambre meublée à Nice nord » loue une
    // chambre, et on ne loue une chambre seule que dans un logement partagé.
    // Noyé dans la description, ce signal se perdait.
    flatShare:
      occurrence.flatShare === null &&
      parseFlatShare(text, occurrence.title, occurrence.description) === true
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
    charges,
    // Même règle du silence : un montant publié par la source fait autorité.
    deposit:
      occurrence.deposit === null
        ? parseDepositFromText(
            occurrence.description,
            occurrence.price,
            rentExcludingCharges({ ...occurrence, charges }),
          )
        : occurrence.deposit,
    tenantFees:
      occurrence.tenantFees === null
        ? parseFeesFromText(occurrence.description, occurrence.price)
        : occurrence.tenantFees,
    // Les pièces se lisent dans le TITRE : « une pièce à vivre » d'une
    // description est le séjour d'un trois-pièces, pas le logement entier.
    rooms: occurrence.rooms === null ? parseRooms(occurrence.title) : occurrence.rooms,
    dpe: occurrence.dpe === null ? parseDpe(occurrence.description) : occurrence.dpe,
    ges: occurrence.ges === null ? parseGes(occurrence.description) : occurrence.ges,
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
        ? // Le point sépare le titre, comme à la normalisation : une description
          // qui s'ouvre sur « À partir du 15 septembre » commence une phrase.
          parseAvailabilityInText(
            `${occurrence.title ?? ''}. ${occurrence.description ?? ''}`,
            nowMs,
          )
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
/**
 * L'adresse à retenir au rejeu : celle déjà stockée, ou celle que le texte rend.
 *
 * UNE ADRESSE STOCKÉE QUE LE TEXTE PROLONGE EST UNE ADRESSE AMPUTÉE. Le cas
 * relevé le 2026-09-09 : « 132 corniche fle », coupée au milieu du nom de voie
 * parce que la description était tronquée avant la recherche. Elle a toutes les
 * apparences d'une rue — ni parking, ni prose — donc elle passait chaque
 * contrôle, et le rejeu la gardait à jamais. Corriger l'extraction ne suffisait
 * pas : les fiches déjà en base restaient fausses.
 *
 * Quand le texte rend « 132 corniche fleurie », qui CONTIENT la stockée en
 * préfixe, il n'y a pas deux adresses possibles : il y en a une, et l'autre
 * s'arrête au milieu d'un mot. Hors de ces cas, la stockée continue de
 * primer — elle vient souvent d'un champ structuré que le texte n'égale pas.
 */
export function bestAddress(stored: string | null, fromText: string | null): string | null {
  if (stored === null || !looksLikeStreet(stored)) return fromText;
  if (fromText === null) return stored;

  /**
   * LA PLUS PRÉCISE GAGNE, et le champ structuré ne l'est pas toujours.
   *
   * La source publie « avenue Sainte Colette » quand sa propre description
   * écrit « 31, avenue Sainte Colette ». C'est le numéro qui place le point sur
   * la carte : sans lui le géocodeur vise le milieu de la voie, et le temps de
   * trajet affiché est celui d'un autre logement. De même « Californie, Nice »
   * — un quartier rangé dans le champ « adresse » — ne doit pas l'emporter sur
   * une vraie voie lue dans le texte.
   *
   * Une voie NUMÉROTÉE l'emporte aussi sur une AUTRE voie nue : Orpi range
   * « Promenade des Anglais » — son secteur — quand le titre écrit « 17 AV DE
   * LA CALIFORNIE ». Le texte n'est lu qu'en tête : un numéro y situe le bien.
   */
  const rangStocke = addressGrade(stored);
  const rangTexte = addressGrade(fromText);
  if (rangTexte > rangStocke) return fromText;

  // Même précision, mais la stockée traîne l'accroche qui suivait un tiret
  // (« 39 BD X - NICE RIQUIER Votre conseiller ») : le texte rend la voie seule.
  const plain = (address: string): string => address.replace(/\s+/g, ' ').trim().toLowerCase();
  if (
    rangTexte === rangStocke &&
    plain(stored).startsWith(plain(fromText)) &&
    /^ ?[-–—]( |$)/.test(plain(stored).slice(plain(fromText).length))
  ) {
    return fromText;
  }

  /**
   * L'ADRESSE AMPUTÉE, ET ELLE SEULE.
   *
   * « 132 corniche fle » puis « 132 corniche fleurie » : le texte ne prolonge
   * pas l'adresse, il termine le MOT qu'elle coupe en deux. C'est à cela qu'on
   * la reconnaît — la suite ne commence pas par un espace.
   *
   * Sans cette précision, « avenue Malaussena » se faisait remplacer par
   * « avenue Malaussena très bien placé », qui la prolonge aussi, mais d'une
   * accroche publicitaire.
   */
  const court = comparable(stored);
  const long = comparable(fromText);
  if (!long.startsWith(court) || long.length <= court.length) return stored;
  return long.charAt(court.length) === ' ' ? stored : fromText;
}

/** Ce qu'il faut connaître de l'annonce pour nettoyer son adresse. */
export interface AddressContext {
  readonly city: string | null;
  readonly postalCode: string | null;
  /** Titre et description. */
  readonly text: string;
}

function cleanAddresses(
  stored: string | null,
  fromText: string | null,
  context: AddressContext,
): [string | null, string | null] {
  return [cleanAddress(stored, context), cleanAddress(fromText, context)];
}

/** Séparateurs et ponctuation qui ne terminent pas une adresse. */
const TRAILING_SEPARATORS = /[\s,;:\-–—(]+$/;

/** Mots après lesquels la ville fait partie du nom : « avenue de Nice ». */
const PARTICLES = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'l', 'sur', 'a', 'en', 'au', 'aux']);

/** Repère de « n'importe quel code postal » parmi les localités à retirer. */
const POSTAL = '#code-postal';

const MONTHS =
  'janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre';

/**
 * Nettoie une adresse, stockée comme extraite, des restes qui ne la situent pas.
 *
 * - LA VILLE OU LE CODE POSTAL DE L'ANNONCE en queue : « 130 Boulevard
 *   Gambetta Nice » ne se distinguait pas de la même voie écrite sans ville.
 *   Jamais après une particule : « avenue de Nice » est un nom de voie.
 * - UNE ANNÉE PRISE POUR UN NUMÉRO : « 2027 Boulevard de la Madeleine », lu
 *   dans « au 31 mai 2027 Boulevard de la Madeleine ». Retirée seulement si le
 *   texte montre cette année derrière un mois : une « 2000 route de … » existe.
 */
export function cleanAddress(address: string | null, context: AddressContext): string | null {
  if (address === null) return null;
  let clean = address.replace(/\s+/g, ' ').trim().replace(TRAILING_SEPARATORS, '');

  const localities = [
    comparable(context.city).replace(/\d+/g, '').trim(),
    context.postalCode ?? '',
    POSTAL,
  ].filter((one) => one !== '');
  for (let stripped = true; stripped;) {
    stripped = false;
    const tokens = [...clean.matchAll(/[^\s,;:\-–—()]+/g)];
    for (const locality of localities) {
      const size = locality.split(' ').length;
      const first = tokens[tokens.length - size];
      if (tokens.length <= size || first?.index === undefined) continue;
      const tail = tokens
        .slice(-size)
        .map((token) => token[0])
        .join(' ');
      // Un code postal, même d'un autre secteur, n'appartient jamais au nom de voie.
      if (comparable(tail) !== locality && !(locality === POSTAL && /^\d{5}$/.test(tail))) continue;
      const before = comparable(tokens[tokens.length - size - 1]?.[0]);
      const rest = clean.slice(0, first.index).replace(TRAILING_SEPARATORS, '');
      // Ce qui reste doit encore nommer quelque chose : « 06000 Nice » reste entier.
      if (PARTICLES.has(before) || !/\p{L}{2}/u.test(rest)) continue;
      clean = rest;
      stripped = true;
      break;
    }
  }

  const year = /^((?:19|20)\d{2}|2100)\s+(\S+)/.exec(clean);
  if (year?.[1] !== undefined && year[2] !== undefined) {
    const dated = new RegExp(`\\b(?:${MONTHS}) ${year[1]} ${comparable(year[2])}\\b`);
    if (dated.test(comparable(context.text))) clean = clean.slice(year[1].length).trim();
  }

  return clean === '' ? null : clean;
}

/**
 * Le type d'une fiche déjà en base, corrigé par son titre dans les seuls cas
 * sûrs : un « parking » que le titre dément, un titre qui nomme un parking, un
 * « autre » que le titre dit professionnel, ou un local commercial explicite.
 */
function rescuedPropertyType(occurrence: NormalizedListing): NormalizedListing['propertyType'] {
  const current = occurrence.propertyType;
  if (current !== 'commercial' && commercialByTitle(occurrence.title, true)) return 'commercial';
  const rescued = parsePropertyType(occurrence.title);
  if ((current === 'other' || current === 'unknown') && rescued === 'commercial') return rescued;
  const fromParking =
    current === 'parking' && rescued !== 'parking' && rescued !== 'other' && rescued !== 'unknown';
  if (fromParking) return rescued;
  const toParking =
    current !== 'parking' &&
    current !== 'commercial' &&
    parkingByTitle(occurrence.title, occurrence.area, occurrence.rooms, occurrence.sourceUrl);
  return toParking ? 'parking' : current;
}

/**
 * UNE RÉFÉRENCE QUE NOUS AVONS COMPOSÉE NOUS-MÊMES, et qui n'est celle de
 * personne.
 *
 * Les alertes e-mail ont porté quelque temps, dans ce champ, l'identité de repli
 * qu'elles se donnent quand le lien du digest reste une redirection opaque :
 * surface, loyer et code postal collés bout à bout — « 31-m-670-cc-06000 » pour
 * un studio de 31 m² à 670 € charges comprises à Nice. Aucune agence ne la
 * reconnaît au téléphone, aucune autre source ne la publie, et elle occupe la
 * place de la vraie.
 *
 * ON LA RECONNAÎT EN LA RECOMPOSANT, jamais à sa forme : les chiffres du champ
 * doivent être exactement ceux de la surface, puis du loyer, puis du code postal
 * de l'occurrence elle-même — les unités écrites (« m² », « cc ») et le nom de
 * commune n'en apportant aucun. Surface ET loyer sont exigés : sur le seul
 * loyer, « FS850 » d'une agence tombait dans le filet. Mesuré sur l'inventaire
 * du 2026-09-18, 4 817 références en base : 336 reconnues, toutes aux alertes
 * e-mail, aucune ailleurs.
 */
function madeUpReference(occurrence: NormalizedListing): boolean {
  const reference = occurrence.contact.reference;
  if (reference === null || occurrence.area === null || occurrence.price === null) return false;

  const figures = (value: string | number): string => String(value).replace(/\D+/g, '');
  const area = figures(occurrence.area);
  const price = figures(occurrence.price);
  if (area === '' || price === '') return false;

  const postal = occurrence.postalCode === null ? '' : figures(occurrence.postalCode);
  const written = figures(reference);
  return written === `${area}${price}${postal}` || written === `${area}${price}`;
}

/**
 * Le contact d'une fiche déjà en base, sa référence remise sur celle que
 * l'agence imprime dans son texte.
 *
 * QUATRE SITUATIONS, UNE SEULE RÈGLE : le texte fait autorité quand il parle,
 * et rien ne bouge quand il se taît.
 *
 *   champ vide          → on le remplit, comme tout le reste du rattrapage ;
 *   champ = `sourceRef` → c'est la trace du repli retiré, un numéro que nous
 *                         avions fabriqué depuis l'URL et que l'agence ne
 *                         reconnaît pas au téléphone ; le texte le remplace ;
 *   champ recomposable  → surface, loyer et code postal collés : notre propre
 *                         fabrication (voir `madeUpReference`) ; le texte la
 *                         remplace, et à défaut elle s'efface ;
 *   champ autre         → la source l'a publié dans un champ dédié, donc plus
 *                         sûr qu'un repêchage dans de la prose : on le garde.
 *
 * ON NE FABRIQUE JAMAIS : un texte muet laisse le champ tel quel, vide s'il
 * l'était — ou vidé, quand il ne portait que notre propre calcul. C'est aussi ce
 * qui protège le bulletin abonné BEP, dont la référence est imprimée en tête
 * d'annonce et non dans le descriptif — son champ égale son `sourceRef` sans
 * être pour autant un numéro inventé.
 */
function rescuedContact(occurrence: NormalizedListing, text: string): Contact {
  // Une référence que nous avons nous-mêmes composée compte pour un champ vide :
  // ou le texte la remplace, ou elle s'en va.
  const current = madeUpReference(occurrence) ? null : occurrence.contact.reference;
  const printed = parsePublishedReference(text);
  const replaceable = current === null || current === occurrence.sourceRef;
  const reference = printed !== null && replaceable ? printed : current;

  if (reference === occurrence.contact.reference) return occurrence.contact;
  return { ...occurrence.contact, reference };
}

/**
 * La commune d'une fiche DÉJÀ EN BASE, quand celle qu'on lui a donnée n'en est
 * pas une.
 *
 * ON NE RELIT QUE CE QUI EST PUBLIÉ : ces annonces portent la commune dans leur
 * titre — « 12 m² Nice, 06100 ». Sans titre qui la nomme, le champ retombe à
 * vide, jamais déduit du code postal que trois communes peuvent partager. Et le
 * code postal du titre doit être celui de la fiche, sans quoi le titre parle
 * d'autre chose.
 *
 * Une commune ABSENTE le reste : lui en trouver une réécrirait tout le stock
 * pour un gain qui n'a pas été mesuré.
 */
function rescuedCity(occurrence: NormalizedListing): string | null {
  if (occurrence.city == null || plausibleCommune(occurrence.city) !== null) return occurrence.city;
  const published = communeWithPostalCode(occurrence.title ?? '');
  if (published === undefined) return null;
  if (occurrence.postalCode !== null && published.postalCode !== occurrence.postalCode) return null;
  return plausibleCommune(published.city);
}

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
  const address = bestAddress(
    ...cleanAddresses(occurrence.address, fromText, {
      city: occurrence.city,
      postalCode: occurrence.postalCode,
      text,
    }),
  );

  // Le type ne se corrige que DANS UN SENS : un « parking » que le titre
  // dément. Le recalculer librement le dégraderait — le scraper le tenait
  // souvent d'un champ dédié que la base ne conserve pas, et le titre seul
  // rendait alors « other » là où « appartement » était juste (§17).
  // L'autre sens, un seul cas : un « autre » que le titre dit professionnel.
  // « Autre » n'affirmait rien ; « Licence IV à louer » affirme quelque chose.
  const propertyType = rescuedPropertyType(occurrence);

  const { features, changed: featuresChanged } = reconcileFeatures(occurrence.features, text);

  const filled = fillGaps(occurrence, text, nowMs);
  const { flatShare, charges, deposit, tenantFees, rooms, dpe, district, maxOccupants } = filled;
  const { ges, furnished, availableAt } = filled;

  // La référence s'affiche, et chez plusieurs agences le texte déjà stocké est
  // le seul endroit où elle figure. Sans ce rejeu, la fiche continue d'annoncer
  // le numéro que nous avions tiré de son URL.
  const contact = rescuedContact(occurrence, text);

  // La commune, quand la sienne est un libellé de bouton plutôt qu'un lieu.
  const city = rescuedCity(occurrence);

  if (
    contact === occurrence.contact &&
    address === occurrence.address &&
    city === occurrence.city &&
    propertyType === occurrence.propertyType &&
    !featuresChanged &&
    flatShare === occurrence.flatShare &&
    charges === occurrence.charges &&
    deposit === occurrence.deposit &&
    tenantFees === occurrence.tenantFees &&
    rooms === occurrence.rooms &&
    dpe === occurrence.dpe &&
    ges === occurrence.ges &&
    district === occurrence.district &&
    maxOccupants === occurrence.maxOccupants &&
    furnished === occurrence.furnished &&
    availableAt === occurrence.availableAt
  ) {
    return null;
  }
  return {
    ...occurrence,
    contact,
    address,
    city,
    propertyType,
    features,
    flatShare,
    charges,
    deposit,
    tenantFees,
    rooms,
    dpe,
    ges,
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

/**
 * Normalise un lot, en écartant les annonces inexploitables.
 *
 * LES DEMANDES DE LOGEMENT SE TRAITENT ICI, et non dans `normalizeListing` :
 * écarter une annonce sur son texte est une décision, et une décision se
 * journalise. `onWantedAd` la rapporte toujours — qu'elle soit suivie d'un
 * retrait ou non — pour qu'on puisse la vérifier après coup.
 *
 * ET SEULES LES SOURCES CONCERNÉES PERDENT L'ANNONCE. Une agence ne publie pas
 * la recherche d'un locataire ; y appliquer la règle ne ferait courir qu'un
 * risque. Ailleurs on signale sans retirer (`hostsWantedAds`).
 */
export function normalizeAll(
  raws: readonly RawListing[],
  options: NormalizeOptions,
): NormalizedListing[] {
  const results: NormalizedListing[] = [];
  for (const raw of raws) {
    const evidence = wantedAdEvidence(raw.title, raw.description);
    if (evidence !== null) {
      const excluded = options.hostsWantedAds === true;
      options.onWantedAd?.(raw, evidence, excluded);
      if (excluded) continue;
    }
    const normalized = normalizeListing(raw, options);
    if (normalized !== null) results.push(normalized);
  }
  return results;
}
