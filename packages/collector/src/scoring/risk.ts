/**
 * RISK SCORE — « cette annonce est-elle suspecte ? ».
 *
 * LE SEUL INDICATEUR DE CE GENRE, et il n'y en aura pas d'autre. « Trop beau
 * pour être vrai » et « fausse annonce » sont la même question posée deux
 * fois : un loyer hors de proportion, un bailleur qu'on ne peut pas nommer, une
 * demande d'argent sans visite. Un second détecteur d'arnaque aurait eu son
 * propre seuil et son propre libellé, donc ses propres faux positifs, pour
 * relire les mêmes annonces. Tout ce qui relève du doute entre donc ici, et
 * s'affiche sous un nom unique — le seuil d'affichage est `RISK_ALERT`.
 *
 * Le score n'est jamais bloquant : une annonce à risque élevé reste visible et
 * consultable, accompagnée de ses raisons. Un signal inhabituel n'est pas une
 * preuve, et masquer une annonce légitime coûterait une visite.
 *
 * IL ALERTE, IL N'ACCUSE PAS. Aucune raison n'affirme qu'une annonce est une
 * arnaque : chacune dit ce qui a été observé, pour que l'utilisateur vérifie
 * lui-même. Une règle qui ne sait pas distinguer l'annonce honnête de la
 * suspecte n'a pas sa place ici — elle est retirée, pas adoucie.
 *
 * Les raisons sont affichées telles quelles dans l'interface, avec leur signe :
 *   ⚠ Prix inhabituellement faible
 *   ⚠ Informations contradictoires entre sources
 *   ✓ Agence identifiable
 *
 * CE QU'IL NE SAIT PAS VOIR, ET POURQUOI : le faux particulier qui reprend les
 * photos d'une location de courte durée. Ce scénario a été mesuré sur
 * l'inventaire, il ne s'y trouve pas, et les règles qui prétendaient le
 * détecter ne désignaient que des annonceurs honnêtes. Le relevé complet et la
 * condition qui rendrait le contrôle utile sont dans `docs/risque-arnaque.md`.
 */

import type { AggregatedListing, ExplainedScore, MergedField, ScoreReason } from '@maioun/shared';
import { clampScore, referenceRentPerSqm, rentForBudget } from '@maioun/shared';
import { comparable } from '../normalization/text.js';

/**
 * Sources qui publient le loyer SUR UNE AUTRE BASE que les autres.
 *
 * Rentumo annonce le loyer hors charges là où l'agence et les portails
 * l'annoncent charges comprises. Relevé du 2026-09-17 sur l'inventaire actif :
 * 55 loyers contredits par Rentumo, moyenne −9,9 %, et les DIX seuls écarts de
 * plus de 15 % du score de risque venaient de lui — aucune autre source n'en
 * produit un seul. Ce n'est donc pas une contradiction, c'est une convention.
 *
 * Le dédoublonnage fait déjà le même constat pour décider si deux annonces
 * peuvent être le même bien.
 */
const OTHER_RENT_BASIS_SOURCES: readonly string[] = ['rentumo'];

/**
 * Un conflit entre sources n'est pas nécessairement suspect.
 *
 * La fusion enregistre fidèlement toute divergence, y compris celles qui
 * s'expliquent trivialement : un portail affiche le loyer charges comprises,
 * l'autre hors charges. Seuls les écarts DISPROPORTIONNÉS méritent d'alimenter
 * le score de risque — sinon presque toute annonce multi-diffusée serait
 * signalée, et le score perdrait tout pouvoir discriminant.
 *
 * @param absoluteTolerance plancher en unités du champ. Il n'est pas
 *   décoratif : sur un studio de 18 m², deux mètres carrés d'arrondi font
 *   onze pour cent. Les deux seuls désaccords de surface de l'inventaire —
 *   18 contre 20 m², 15 contre 17 — étaient de ceux-là.
 * @param ignoredSources sources dont le désaccord s'explique par leur
 *   convention d'affichage, et non par une contradiction.
 */
function hasSignificantConflict(
  field: MergedField<number | null>,
  relativeTolerance: number,
  absoluteTolerance: number,
  ignoredSources: readonly string[] = [],
): boolean {
  const reference = field.value;
  if (reference === null || reference === 0) return false;

  return field.conflicts.some((conflict) => {
    if (conflict.value === null) return false;
    if (ignoredSources.includes(conflict.sourceId)) return false;
    const gap = Math.abs(conflict.value - reference);
    return gap > absoluteTolerance && gap / Math.abs(reference) > relativeTolerance;
  });
}

export interface RiskOptions {
  /**
   * Loyer de référence au m² à NICE, en €/m²/mois, toutes tailles confondues.
   *
   * Il ne sert plus que lorsque le nombre de pièces manque : sinon le repère
   * publié par la Carte des loyers, choisi d'après la taille, est plus juste.
   * Et il ne sort jamais de Nice — c'est de Nice qu'il vient.
   *
   * Ne jamais le présenter à l'utilisateur comme un prix de marché constaté :
   * c'est un indicateur de loyers D'ANNONCE, pas de baux signés.
   */
  readonly referencePricePerSqm: number;
}

/**
 * Valeur de départ pour Nice, à affiner.
 *
 * Choisie volontairement basse pour éviter les faux positifs : mieux vaut ne
 * pas signaler une annonce douteuse que d'en signaler dix légitimes.
 */
export const DEFAULT_REFERENCE_PRICE_PER_SQM = 20;

/**
 * Les mots qui désignent un versement. Ils servent à exiger qu'une formulation
 * parle bien d'ARGENT avant de la tenir pour suspecte.
 */
const PAYMENT_WORDS =
  'acompte|arrhes|caution|depot de garantie|virement|paiement|payer|regler|reglement|versement|verser';

/**
 * Formulations relevées dans les arnaques locatives courantes.
 * Leur présence est un signal, jamais une preuve.
 *
 * CHACUNE EXIGE SON CONTEXTE, et ce n'est pas de la coquetterie : mesurées le
 * 2026-09-17 sur les 3 080 annonces actives décrites, les formes larges
 * d'avant ne signalaient QUE des annonces honnêtes — cinq sur cinq.
 * « Expatrié » désignait le locataire recherché (« idéal étudiant, télé-
 * travailleur, expatrié ») et non le bailleur ; « avant la visite » portait
 * sur le DOSSIER, que toute agence niçoise demande avant de faire visiter.
 * Aucune des formes resserrées ci-dessous ne se déclenche sur cet inventaire :
 * elles attendent une annonce qui parle vraiment d'argent sans visite.
 */
const SUSPICIOUS_PATTERNS: readonly { pattern: RegExp; label: string; points: number }[] = [
  {
    // Les moyens intraçables, ceux qu'aucune agence n'emploie : mandat, coupon
    // prépayé, cryptomonnaie. Zéro occurrence dans l'inventaire, donc zéro
    // risque de signaler à tort.
    pattern:
      /\b(western union|moneygram|mandat cash|mandat postal|paypal ami|bitcoin|crypto monnaie|cryptomonnaie|usdt|carte pcs|coupon paysafe|ticket premium|neosurf)\b/,
    label: 'Moyen de paiement inhabituel mentionné',
    points: 35,
  },
  {
    // IL FAUT UN SUJET À LA PREMIÈRE PERSONNE. Le mot « expatrié » seul parle
    // neuf fois sur dix du locataire que l'annonce cherche.
    pattern:
      /\b(je (?:suis|reside|habite|vis|travaille)|nous (?:sommes|residons|habitons|vivons|travaillons))\b[^.]{0,40}\b(a l etranger|hors de france|expatrie|expatriee|en expatriation|en mission a l etranger)\b/,
    label: 'Le bailleur déclare être à l’étranger',
    points: 30,
  },
  {
    // DE L'ARGENT ET PAS DE VISITE, dans la même phrase. « Avant la remise des
    // clés » est délibérément absent : un dépôt de garantie versé à la remise
    // des clés est la règle, et sept annonces de l'inventaire l'écrivent.
    pattern: new RegExp(
      `\\b(${PAYMENT_WORDS})\\b[^.]{0,60}\\bavant (?:la |toute |votre )?visite\\b` +
        `|\\bavant (?:la |toute |votre )?visite\\b[^.]{0,60}\\b(${PAYMENT_WORDS})\\b` +
        `|\\b(?:sans (?:aucune )?visite|visite impossible)\\b[^.]{0,60}\\b(${PAYMENT_WORDS})\\b`,
    ),
    label: 'Paiement demandé avant toute visite',
    points: 35,
  },
  {
    pattern:
      /\b(envoyez? (?:vos |une )?(?:copie|photo)s? (?:de |du )?(?:passeport|carte d identite))\b/,
    label: 'Demande de pièce d’identité dès le premier contact',
    points: 20,
  },
  {
    // Formulation libre : « les clés vous seront envoyées par courrier »,
    // « remise des clés par la poste »… On accepte jusqu'à quarante caractères
    // entre le mot « clé » et le mode d'acheminement, sans franchir une phrase.
    pattern: /\bcles?\b[^.]{0,40}\b(par courrier|par la poste|par colis|par envoi postal)\b/,
    label: 'Remise des clés par courrier',
    points: 30,
  },
];

/**
 * `true` si le bien est un LOGEMENT, au sens où son loyer au mètre carré se
 * compare à celui du marché résidentiel. Un parking, un garage ou un local
 * n'entrent pas dans cette comparaison.
 *
 * Un type non précisé (`unknown`, `other`) compte, sauf sous 9 m² (cave, box) :
 * les digests et certains sites ne typent pas leurs logements, et les exclure
 * laissait le contrôle muet sur eux.
 *
 * MAIS IL LUI FAUT UN NOMBRE DE PIÈCES. Sans type ni pièces, rien ne dit qu'on
 * regarde un logement : « Louer immobilier 750 € à Nice » couvrait un GARAGE de
 * 170 m², signalé comme un loyer six fois trop bas. Six annonces de
 * l'inventaire du 2026-09-17 sont dans ce cas sur 2 659 comparées — l'exigence
 * ne coûte presque rien, et le repère lui-même se choisit d'après la taille.
 */
function isDwelling(listing: AggregatedListing): boolean {
  const type = listing.propertyType.value;
  if (type === 'apartment' || type === 'house' || type === 'studio' || type === 'loft') {
    return true;
  }
  const area = listing.area.value;
  return (
    (type === 'unknown' || type === 'other') &&
    (area === null || area >= 9) &&
    listing.rooms.value !== null
  );
}

/**
 * Le loyer au m² auquel comparer celui de l'annonce.
 *
 * LE REPÈRE DÉPEND DE LA TAILLE, et l'ignorer faisait passer le petit logement
 * pour le suspect. Un studio se loue 22,7 €/m² à Nice, un trois-pièces 19,7 :
 * quinze pour cent d'écart, exactement dans la zone où la règle bascule. Les
 * deux valeurs viennent de la Carte des loyers publiée par l'État.
 *
 * HORS DE NICE, ON NE COMPARE PLUS RIEN. Le repère de la configuration EST
 * celui de Nice : le retenir ailleurs, c'était prêter à Bezaudun-les-Alpes les
 * loyers de la promenade des Anglais. Mesuré le 2026-09-17 : quatorze annonces
 * signalées hors de Nice, de Menton au Vaucluse, toutes entre 8 et 12 €/m² —
 * c'est-à-dire au prix normal de leur commune — et pas une arnaque. Une
 * commune sans indicateur publié devient donc un signal inconnu, ce qui est la
 * seule chose vraie qu'on puisse en dire.
 */
function marketReference(listing: AggregatedListing, options: RiskOptions): number | null {
  if (!isNice(listing)) return null;
  // Le repère publié dépend de la taille ; la configuration ne sert que là où
  // le nombre de pièces manque, et elle y porte la même valeur toutes tailles.
  return listing.rooms.value === null
    ? options.referencePricePerSqm
    : referenceRentPerSqm(listing.rooms.value);
}

/**
 * L'annonce est-elle à Nice, seule commune dont nous ayons un loyer de
 * référence publié ?
 *
 * LE CODE POSTAL TRANCHE AVANT LE NOM DE LA COMMUNE, parce que le nom se
 * trompe : cinq maisons Citya du Vaucluse et des Bouches-du-Rhône portaient
 * `ville = nice` avec un code postal en 84 ou 13, et deux d'entre elles
 * arrivaient en tête des annonces « à risque ». Les quatre codes ci-dessous
 * n'appartiennent qu'à Nice.
 */
function isNice(listing: AggregatedListing): boolean {
  const postalCode = listing.postalCode.value;
  if (postalCode !== null) return NICE_POSTAL_CODES.includes(postalCode);
  return listing.city.value === 'nice';
}

const NICE_POSTAL_CODES: readonly string[] = ['06000', '06100', '06200', '06300'];

/**
 * Pourquoi le loyer au m² de cette annonce ne se compare à rien.
 *
 * La raison est affichée à l'utilisateur : « je ne sais pas » ne vaut que
 * accompagné de son motif.
 */
function whyNotComparable(listing: AggregatedListing): string {
  if (listing.flatShare.value === true) {
    return 'colocation : la surface est celle du logement entier';
  }
  const type = listing.propertyType.value;
  return type === 'unknown' || type === 'other'
    ? 'rien ne dit qu’il s’agit d’un logement'
    : 'bien non résidentiel';
}

/**
 * Ce que le contact dit de l'identité du bailleur : une raison, ou un signal
 * inconnu (chaîne).
 *
 * Un formulaire sans coordonnées, c'est la règle du portail (LocService,
 * Bien'ici, digests) et non un choix du bailleur : le signal tombait sur une
 * annonce sur deux, selon la seule source. Il reste donc inconnu.
 */
function identitySignal(listing: AggregatedListing): ScoreReason | string {
  const { agencyName, phone, email, formUrl } = listing.contact;
  if (agencyName !== null) {
    return { code: 'identity.agency', label: `Agence identifiable (${agencyName})`, delta: 0 };
  }
  if (phone !== null || email !== null) {
    return { code: 'identity.partial', label: 'Bailleur non identifié nommément', delta: 5 };
  }
  if (formUrl !== null) return 'identité du bailleur (masquée derrière un formulaire)';
  return { code: 'identity.none', label: 'Aucune identité ni coordonnée vérifiable', delta: 15 };
}

export function scoreRisk(listing: AggregatedListing, options: RiskOptions): ExplainedScore {
  const reasons: ScoreReason[] = [];
  const unknownSignals: string[] = [];
  let total = 0;

  const price = listing.price.value;
  const area = listing.area.value;

  // --- Loyer anormalement faible -------------------------------------------
  //
  // LA RÈGLE NE VAUT PAS PARTOUT, et l'ignorer coûtait cher. Mesuré sur
  // l'inventaire du 2026-09-02 : sur 57 annonces « à risque », 46 étaient des
  // COLOCATIONS, et pas une seule arnaque. Le calcul divisait le loyer d'UNE
  // CHAMBRE par la surface de TOUT l'appartement — « 780 € / 135 m² » donne
  // 5,8 €/m², et l'annonce partait en bas de liste comme suspecte.
  //
  // Même chose pour ce qui n'est pas un logement : un box à 100 € pour 15 m²
  // n'a pas de prix au mètre carré comparable à celui d'un appartement.
  //
  // Dans les deux cas on ne conclut RIEN plutôt que de conclure faux : le
  // signal rejoint les angles morts déclarés.
  const wholeDwelling = listing.flatShare.value !== true && isDwelling(listing);
  const reference = marketReference(listing, options);
  if (!wholeDwelling) {
    unknownSignals.push(`loyer au m² (${whyNotComparable(listing)})`);
  } else if (price === null || area === null) {
    unknownSignals.push(price === null ? 'loyer' : 'surface');
  } else if (reference === null) {
    unknownSignals.push('loyer au m² (aucun loyer de référence publié pour cette commune)');
  } else if (area > 0) {
    // LE REPÈRE EST CHARGES COMPRISES, le loyer publié ne l'est pas toujours.
    // Comparer 731 € hors charges à un indicateur qui en vaut 791 faisait
    // passer pour bradé un deux-pièces Riquier au prix du quartier. À défaut de
    // total calculable, on garde le montant publié — jamais moins.
    const allIn =
      rentForBudget({
        price,
        charges: listing.charges.value,
        chargesIncluded: listing.chargesIncluded,
      }) ?? price;
    const pricePerSqm = allIn / area;
    const ratio = pricePerSqm / reference;
    if (ratio < 0.4) {
      total += 40;
      reasons.push({
        code: 'price.veryLow',
        label: `Loyer très inférieur au marché (${pricePerSqm.toFixed(1)} €/m²)`,
        delta: 40,
      });
    } else if (ratio < 0.6) {
      total += 20;
      reasons.push({
        code: 'price.low',
        label: `Loyer nettement sous le marché (${pricePerSqm.toFixed(1)} €/m²)`,
        delta: 20,
      });
    } else {
      reasons.push({ code: 'price.normal', label: 'Loyer cohérent avec le marché', delta: 0 });
    }
  }

  // --- Incohérences internes ------------------------------------------------
  //
  // LE MÊME PIÈGE QUE LE LOYER AU M², ET IL N'AVAIT PAS ÉTÉ REFERMÉ ICI : en
  // colocation, la surface est celle de la chambre et le nombre de pièces celui
  // du logement entier. « 5 pièces annoncées pour 12 m² » décrit une chambre
  // dans un cinq-pièces, pas une annonce truquée. Quatre des cinq incohérences
  // de l'inventaire du 2026-09-17 étaient de celles-là.
  const rooms = listing.rooms.value;
  if (wholeDwelling && rooms !== null && area !== null) {
    // Moins de 9 m² par pièce est physiquement improbable pour un logement.
    if (area / rooms < 9) {
      total += 15;
      reasons.push({
        code: 'inconsistent.roomsArea',
        label: `${rooms} pièces annoncées pour ${area} m² — incohérent`,
        delta: 15,
      });
    }
  }

  // --- Contradictions entre sources ----------------------------------------
  //
  // La fusion a relevé tous les désaccords ; on ne retient ici que ceux qui
  // dépassent l'explication ordinaire (charges comprises ou non, arrondi).
  //
  // L'ADRESSE A ÉTÉ RETIRÉE DE CE CONTRÔLE. Elle fournissait à elle seule
  // quarante-trois des cinquante-quatre signalements du 2026-09-17, et
  // trente-neuf n'étaient qu'une même voie écrite autrement : « 39 BD DELFINO »
  // contre « 39 Boulevard Général Louis Delfino », « Rue Miollis » contre
  // « 9 Rue Miollis », « Raoul Dufy » contre « Raoul Duffy ». Les quatre qui
  // restaient désignaient deux voies distinctes — c'est un rapprochement
  // douteux entre deux annonces, pas l'indice d'une arnaque, et la place d'un
  // tel doute n'est pas dans le score de risque.
  const conflictingFields: string[] = [];
  // 15 % d'écart sur un loyer dépasse largement l'effet des charges, et 30 €
  // d'écart absolu restent une différence de charges sur un petit loyer.
  if (hasSignificantConflict(listing.price, 0.15, 30, OTHER_RENT_BASIS_SOURCES)) {
    conflictingFields.push('loyer');
  }
  // 10 % d'écart sur une surface ne s'explique pas par un arrondi — au-delà de
  // deux mètres carrés, seuil en deçà duquel deux sources arrondissent.
  if (hasSignificantConflict(listing.area, 0.1, 2)) conflictingFields.push('surface');
  if (conflictingFields.length > 0) {
    const points = conflictingFields.length * 10;
    total += points;
    reasons.push({
      code: 'inconsistent.sources',
      label: `Informations contradictoires entre sources : ${conflictingFields.join(', ')}`,
      delta: points,
    });
  }

  // --- Identité vérifiable --------------------------------------------------
  const identity = identitySignal(listing);
  if (typeof identity === 'string') {
    unknownSignals.push(identity);
  } else {
    total += identity.delta;
    reasons.push(identity);
  }

  // --- Formulations suspectes dans la description ---------------------------
  const description = listing.description.value;
  if (description === null) {
    unknownSignals.push('description');
  } else {
    const haystack = comparable(description);
    for (const { pattern, label, points } of SUSPICIOUS_PATTERNS) {
      if (pattern.test(haystack)) {
        total += points;
        reasons.push({ code: 'suspicious.wording', label, delta: points });
      }
    }
  }

  // --- Adresse absente sur une annonce par ailleurs très détaillée ----------
  if (listing.address.value === null && listing.latitude.value === null) {
    unknownSignals.push('localisation précise');
  }

  const optionalSignals = 4;
  const missing = Math.min(optionalSignals, unknownSignals.length);

  return {
    value: clampScore(total),
    reasons,
    unknownSignals,
    confidence: (optionalSignals - missing) / optionalSignals,
  };
}
