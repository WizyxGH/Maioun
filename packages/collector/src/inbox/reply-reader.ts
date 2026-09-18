/**
 * DE QUELLE ANNONCE PARLE CE MESSAGE, ET QU'EST-CE QU'IL PROUVE.
 *
 * Couche pure : aucune base, aucun réseau, aucune boîte mail. Elle reçoit un
 * message déjà lu et les annonces plausibles, et rend au plus UNE proposition
 * de statut, accompagnée de la phrase qui l'a déclenchée — l'utilisateur
 * valide, il ne signe pas à l'aveugle. Seul l'accusé de réception d'un portail
 * s'applique d'office : c'est le portail lui-même qui atteste l'envoi.
 *
 * RIEN DU CORPS NE SORT D'ICI hormis cette phrase courte et l'identifiant du
 * message. Aucune date, aucune référence n'est fabriquée : ce qui ne se lit pas
 * reste absent.
 *
 * MIEUX VAUT SE TAIRE QUE DÉSIGNER LA MAUVAISE ANNONCE. Sans correspondance
 * certaine — et deux annonces également plausibles n'en font pas une — il n'y a
 * pas de proposition du tout.
 */

import type { TrackingStatus } from '@maioun/shared';
import { comparable, tokenize } from '../normalization/text.js';
import { adresseNormalisee, vientDUnPortail } from './senders.js';
import { estReponseAutomatique, lireIntention } from './intentions.js';
import { textesDuMessage } from './quotes.js';

/** Un message déjà descendu de la boîte, réduit à ce qui sert ici. */
export interface MessageRecu {
  /** `Message-ID` : la seule trace du message qui ressort de cette couche. */
  readonly id: string;
  /** En-tête `From`, tel quel. */
  readonly from: string;
  readonly subject?: string | null;
  /** Corps HTML ou texte. Il ne ressort jamais d'ici. */
  readonly body?: string | null;
  /** En-têtes utiles (`auto-submitted`, `precedence`…), en minuscules ou non. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** Une annonce que ce message pourrait concerner. */
export interface AnnonceCandidate {
  readonly listingId: string;
  /** Référence de l'annonce chez l'annonceur. */
  readonly reference?: string | null;
  /** Adresse publiée par l'agence. */
  readonly agencyEmail?: string | null;
  readonly address?: string | null;
  readonly price?: number | null;
}

/** Ce qui a permis de désigner l'annonce, du plus fort au plus faible. */
export type ForceAppariement = 'reference' | 'adresse-email' | 'bien-et-loyer';

export interface PropositionStatut {
  readonly listingId: string;
  readonly statut: TrackingStatus;
  readonly appariement: ForceAppariement;
  /** La phrase exacte du message qui justifie la proposition. */
  readonly phrase: string;
  /**
   * `true` uniquement pour l'accusé de réception d'un portail : le seul signal
   * que l'utilisateur n'a pas à valider.
   */
  readonly appliquerDOffice: boolean;
  readonly messageId: string;
  /** Date de visite TELLE QU'ÉCRITE dans le message, jamais recalculée. */
  readonly dateCitee?: string;
}

/** Pourquoi rien n'est proposé — pour le journal, pas pour l'écran. */
export type RaisonSilence =
  | 'expediteur-utilisateur'
  | 'expediteur-inconnu'
  | 'reponse-automatique'
  | 'message-vide'
  | 'aucune-annonce-certaine'
  | 'plusieurs-annonces'
  | 'aucune-intention';

export interface LectureReponse {
  readonly proposition: PropositionStatut | null;
  readonly raison?: RaisonSilence;
}

export interface LectureOptions {
  /**
   * Adresses de l'utilisateur. Sa propre relance revient dans le fil ; la lire
   * comme une réponse d'agence ferait avancer le statut tout seul.
   */
  readonly adressesUtilisateur?: readonly string[];
  /**
   * Fragments d'expéditeurs suivis. Fournis, ils servent de second verrou : un
   * message venu d'ailleurs n'est jamais interprété.
   */
  readonly expediteursSuivis?: readonly string[];
}

const silence = (raison: RaisonSilence): LectureReponse => ({ proposition: null, raison });

/** Échappe une chaîne pour un usage littéral dans une expression régulière. */
function echapper(valeur: string): string {
  return valeur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Motif reconnaissant une référence, séparateurs libres (« REF-4521 » trouve
 * « ref 4521 »). `null` quand la référence est trop pauvre pour désigner quoi
 * que ce soit : une suite de quatre chiffres attraperait un millésime ou un
 * bout de montant, et l'annonce désignée serait la mauvaise.
 */
function motifReference(reference: string): RegExp | null {
  const morceaux = reference.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const compact = morceaux.join('');
  if (!/\d/.test(compact)) return null;
  const minimum = /^\d+$/.test(compact) ? 5 : 4;
  if (compact.length < minimum) return null;
  const corps = morceaux.map(echapper).join('[\\s._/-]*');
  return new RegExp(`(?<![A-Z0-9])${corps}(?![A-Z0-9])`, 'i');
}

/** `true` si le texte cite la référence de cette annonce. */
function referenceCitee(texte: string, candidate: AnnonceCandidate): boolean {
  const reference = candidate.reference?.trim();
  if (reference == null || reference === '') return false;
  const motif = motifReference(reference);
  return motif !== null && motif.test(texte);
}

/** `true` si le message vient de l'adresse publiée par cette agence. */
function memeAgence(from: string | null, candidate: AnnonceCandidate): boolean {
  if (from === null) return false;
  return adresseNormalisee(candidate.agencyEmail) === from;
}

/** Les chiffres d'un montant, débarrassés des espaces de milliers. */
function montantsComparables(texte: string): string {
  return texte.replace(/(\d)[\s.](?=\d{3}(?!\d))/g, '$1');
}

/** `true` si le texte cite ce loyer. */
function loyerCite(texte: string, prix: number | null | undefined): boolean {
  if (prix == null || !Number.isFinite(prix) || prix <= 0) return false;
  const entier = String(Math.round(prix));
  return new RegExp(`(?<![\\d,.])${entier}(?![\\d])`).test(montantsComparables(texte));
}

/**
 * `true` si le texte cite l'adresse du bien. Deux mots significatifs au moins :
 * « rue » seul désignerait la moitié de la ville.
 */
function adresseCitee(texte: string, adresse: string | null | undefined): boolean {
  if (adresse == null || adresse.trim() === '') return false;
  const mots = [...new Set(tokenize(adresse).filter((mot) => mot.length >= 4))];
  if (mots.length < 2) return false;
  const cible = comparable(texte);
  return mots.filter((mot) => cible.includes(mot)).length >= 2;
}

/** `true` si le texte décrit le bien ET son loyer — les deux, ou rien. */
function bienEtLoyerCites(texte: string, candidate: AnnonceCandidate): boolean {
  return adresseCitee(texte, candidate.address) && loyerCite(texte, candidate.price);
}

interface Appariement {
  readonly candidate: AnnonceCandidate;
  readonly force: ForceAppariement;
}

/**
 * Désigne l'annonce dont parle le message, en resserrant du critère le plus
 * fort au plus faible. `'plusieurs'` quand plusieurs annonces restent également
 * plausibles — le message parle de plusieurs biens, ou l'agence en gère
 * plusieurs : dans les deux cas on se tait.
 */
function apparier(
  texte: string,
  from: string | null,
  candidates: readonly AnnonceCandidate[],
): Appariement | 'plusieurs' | null {
  if (candidates.length === 0) return null;

  const forceDe = (candidate: AnnonceCandidate): ForceAppariement | null => {
    if (referenceCitee(texte, candidate)) return 'reference';
    if (memeAgence(from, candidate)) return 'adresse-email';
    if (bienEtLoyerCites(texte, candidate)) return 'bien-et-loyer';
    return null;
  };

  const etapes: readonly ((candidate: AnnonceCandidate) => boolean)[] = [
    (candidate) => referenceCitee(texte, candidate),
    (candidate) => memeAgence(from, candidate),
    (candidate) => bienEtLoyerCites(texte, candidate),
  ];

  let restants = candidates;
  let critereApplique = false;
  for (const etape of etapes) {
    const retenus = restants.filter(etape);
    if (retenus.length === 0) continue;
    critereApplique = true;
    restants = retenus;
    if (restants.length === 1) break;
  }

  if (!critereApplique) return null;
  if (restants.length > 1) return 'plusieurs';
  const candidate = restants[0];
  if (candidate === undefined) return null;
  const force = forceDe(candidate);
  return force === null ? null : { candidate, force };
}

/**
 * Lit un message et en tire, s'il y a lieu, UNE proposition de statut.
 *
 * L'appariement se fait sur le message ENTIER, citation comprise : c'est ce que
 * nous avons nous-mêmes écrit qui dit de quelle annonce il s'agit. L'intention,
 * elle, ne se lit QUE dans ce que l'expéditeur a écrit : la citation en bas du
 * fil contient nos propres mots et ne prouve rien.
 */
export function lireReponse(
  message: MessageRecu,
  annoncesCandidates: readonly AnnonceCandidate[],
  options: LectureOptions = {},
): LectureReponse {
  const from = adresseNormalisee(message.from);
  const sujet = message.subject?.trim() ?? '';

  const siennes = new Set(
    (options.adressesUtilisateur ?? [])
      .map((adresse) => adresseNormalisee(adresse))
      .filter((adresse): adresse is string => adresse !== null),
  );
  if (from !== null && siennes.has(from)) return silence('expediteur-utilisateur');

  const suivis = options.expediteursSuivis;
  if (
    suivis !== undefined &&
    (from === null || !suivis.some((f) => from.includes(f.toLowerCase())))
  ) {
    return silence('expediteur-inconnu');
  }

  const textes = textesDuMessage(message.body);
  if (textes.complet === '' && sujet === '') return silence('message-vide');

  if (estReponseAutomatique(sujet, textes.nouveau, message.headers ?? {})) {
    return silence('reponse-automatique');
  }

  const appariement = apparier(`${sujet}\n${textes.complet}`, from, annoncesCandidates);
  if (appariement === null) return silence('aucune-annonce-certaine');
  if (appariement === 'plusieurs') return silence('plusieurs-annonces');

  const portail = vientDUnPortail(message.from);
  const intention = lireIntention(sujet, textes.nouveau, portail);
  if (intention === null) return silence('aucune-intention');

  return {
    proposition: {
      listingId: appariement.candidate.listingId,
      statut: intention.statut,
      appariement: appariement.force,
      phrase: intention.phrase,
      appliquerDOffice: portail && intention.statut === 'contacted',
      messageId: message.id,
      ...(intention.dateCitee === undefined ? {} : { dateCitee: intention.dateCitee }),
    },
  };
}
