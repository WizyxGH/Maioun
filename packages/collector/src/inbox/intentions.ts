/**
 * CE QU'UN MESSAGE PROUVE — et surtout ce qu'il ne prouve pas.
 *
 * Les motifs sont volontairement étroits. Un faux positif fait proposer à
 * l'utilisateur de classer « refusé » une annonce encore vivante ; il finirait
 * par tout valider sans lire, et la couche entière ne servirait plus à rien.
 * « Nous revenons vers vous » en est l'exemple : c'est une réponse, jamais un
 * refus.
 */

import type { TrackingStatus } from '@maioun/shared';

/** Longueur maximale de la phrase montrée à l'écran. */
const LONGUEUR_PHRASE = 160;

const MOIS =
  'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
const JOURS = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';
const HEURE = '(?:\\s*(?:à|a)\\s*\\d{1,2}\\s*(?:h|:)\\s*\\d{0,2})?';

/** Dates telles qu'une agence les écrit. On rend le TEXTE, jamais une date calculée. */
const DATES: readonly RegExp[] = [
  new RegExp(`\\b(?:${JOURS})\\s+\\d{1,2}(?:er)?\\s+(?:${MOIS})(?:\\s+\\d{4})?${HEURE}`, 'i'),
  new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${MOIS})(?:\\s+\\d{4})?${HEURE}`, 'i'),
  new RegExp(`\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?${HEURE}`, 'i'),
  new RegExp(`\\b(?:${JOURS})\\s+(?:prochain\\s+)?(?:à|a)\\s*\\d{1,2}\\s*(?:h|:)\\s*\\d{0,2}`, 'i'),
];

/** Le bien n'est plus à prendre. */
const LOUE: readonly RegExp[] = [
  /\b(?:bien|logement|appartement|studio|annonce|lot|t\d)\b[^.\n]{0,50}(?:est|a\s+été|vient d(?:'|’)être)\s+(?:déjà\s+)?lou[ée]/i,
  /\bdéjà lou[ée]\b/i,
  /n(?:'|’)est plus (?:disponible|à la location|libre)/i,
  /(?:retiré|retirée|retirés|retirées) de (?:la location|notre portefeuille|nos disponibilités)/i,
  /(?:annonce|offre) (?:est )?(?:clôturée|cloturée|close|pourvue)/i,
];

/** Le dossier n'est pas retenu — à ne pas confondre avec une attente. */
const REFUS: readonly RegExp[] = [
  /(?:dossier|candidature|profil)[^.\n]{0,60}n(?:'|’)(?:a|ont) pas été (?:retenue?s?|sélectionnée?s?|selectionnée?s?)/i,
  /nous ne (?:donnons|donnerons) pas suite/i,
  /ne (?:pouvons|pourrons) pas donner suite/i,
  /nous n(?:'|’)avons pas retenu votre (?:dossier|candidature)/i,
  /(?:le choix|notre choix|le propriétaire) s(?:'|’)est port[ée] sur un autre/i,
];

/** Une visite est confirmée — la date, elle, se vérifie à part. */
const VISITE_CONFIRMEE: readonly RegExp[] = [
  /(?:je (?:vous )?|nous (?:vous )?)?confirm(?:e|ons)[^.\n]{0,50}(?:visite|rendez-vous|rdv)/i,
  /(?:visite|rendez-vous|rdv)[^.\n]{0,40}(?:est|sera)?\s*(?:bien\s+)?(?:confirmée?|confirmé|fixée?|fixé|not[ée]e?|enregistrée?)/i,
  /(?:je vous attends|nous vous attendons)[^.\n]{0,40}\b(?:le|à)\b/i,
];

/** Une visite est proposée, rien n'est fixé. */
const VISITE_PROPOSEE: readonly RegExp[] = [
  /(?:propose|proposons|proposer|proposerais?)[^.\n]{0,40}(?:une |de |la )?visite/i,
  /(?:créneaux?|creneaux?|disponibilités?|disponibilites?)[^.\n]{0,60}(?:visite|visiter)/i,
  /(?:visite|visiter)[^.\n]{0,60}(?:créneaux?|creneaux?|disponibilités?|disponibilites?)/i,
  /(?:seriez|êtes|etes)[- ]vous (?:disponible|libre)[^.\n]{0,60}(?:visite|visiter)/i,
  /souhaitez[- ]vous (?:visiter|une visite|programmer)/i,
  /(?:organiser|programmer|caler|convenir d(?:'|’)une|fixer une)\s+(?:une\s+)?visite/i,
  /quand (?:souhaitez|voulez|pourriez)[- ]vous (?:visiter|le visiter)/i,
];

/** Accusé de réception d'un portail — le seul signal appliqué d'office. */
const ACCUSE_PORTAIL: readonly RegExp[] = [
  /votre (?:demande|message|contact)[^.\n]{0,60}(?:a bien été|bien) (?:transmis|transmise|envoyé|envoyée|adressé|adressée|reçue?|prise? en compte)/i,
  /(?:nous avons bien|a bien) (?:reçu|recu|transmis) votre (?:demande|message)/i,
  /votre (?:demande|message) (?:est|a été) (?:bien )?(?:transmis|transmise) à l(?:'|’)(?:annonceur|agence)/i,
];

/** Réponse automatique d'absence : ce n'est pas l'agence qui parle. */
const ABSENCE: readonly RegExp[] = [
  /(?:réponse|reponse|message) automatique/i,
  /(?:absent|absente)[^.\n]{0,40}(?:du bureau|jusqu(?:'|’)au|de l(?:'|’)agence)/i,
  /actuellement (?:absent|absente|en congés|en conges|fermée?)/i,
  /(?:notre agence|nos bureaux)[^.\n]{0,40}(?:ferm[ée]e?s?|en congés|en conges)/i,
  /\bout of office\b/i,
  /de retour le \d/i,
];

/** En-têtes qui déclarent, sans ambiguïté, un envoi automatique. */
const ENTETES_AUTOMATIQUES: readonly string[] = [
  'x-autoreply',
  'x-autorespond',
  'x-auto-response-suppress',
];

/** `true` si ce message est une réponse automatique d'absence. */
export function estReponseAutomatique(
  sujet: string,
  texte: string,
  entetes: Readonly<Record<string, string>> = {},
): boolean {
  const normalises = new Map(
    Object.entries(entetes).map(([cle, valeur]) => [cle.toLowerCase(), valeur.toLowerCase()]),
  );
  const autoSubmitted = normalises.get('auto-submitted') ?? '';
  if (autoSubmitted !== '' && autoSubmitted !== 'no') return true;
  if ((normalises.get('precedence') ?? '') === 'auto_reply') return true;
  if (ENTETES_AUTOMATIQUES.some((entete) => normalises.has(entete))) return true;
  return ABSENCE.some((motif) => motif.test(`${sujet}\n${texte}`));
}

/** La phrase qui entoure une trouvaille, raccourcie pour l'écran. */
export function phraseContenant(texte: string, debut: number, fin: number): string {
  const separateur = /[.!?\n;]/;
  let gauche = debut;
  while (gauche > 0 && !separateur.test(texte[gauche - 1] ?? '')) gauche -= 1;
  let droite = fin;
  while (droite < texte.length && !separateur.test(texte[droite] ?? '')) droite += 1;
  if (droite < texte.length && texte[droite] !== '\n') droite += 1;
  const phrase = texte.slice(gauche, droite).replace(/\s+/g, ' ').trim();
  if (phrase.length <= LONGUEUR_PHRASE) return phrase;
  return `${phrase.slice(0, LONGUEUR_PHRASE - 1).trimEnd()}…`;
}

/** Première trouvaille d'une famille de motifs, avec sa phrase. */
function premiere(texte: string, motifs: readonly RegExp[]): string | null {
  for (const motif of motifs) {
    const trouvaille = motif.exec(texte);
    if (trouvaille !== null) {
      return phraseContenant(texte, trouvaille.index, trouvaille.index + trouvaille[0].length);
    }
  }
  return null;
}

/** La date telle qu'elle est ÉCRITE, ou `null` : on n'en fabrique aucune. */
export function dateCitee(texte: string): string | null {
  for (const motif of DATES) {
    const trouvaille = motif.exec(texte);
    if (trouvaille !== null) return trouvaille[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}

/** Ce qu'un message prouve. */
export interface Intention {
  readonly statut: TrackingStatus;
  /** La phrase exacte qui l'a déclenchée. */
  readonly phrase: string;
  /** Date de visite telle qu'écrite, quand le message en donne une. */
  readonly dateCitee?: string;
}

/**
 * Lit l'intention du texte ÉCRIT PAR L'EXPÉDITEUR (citation exclue).
 *
 * L'ordre compte : « le bien est loué, votre dossier n'a pas été retenu » parle
 * d'abord d'un bien parti. `portail` n'autorise l'accusé de réception que
 * lorsque le message vient réellement d'un portail — la même phrase écrite par
 * une agence est une réponse, pas un envoi confirmé.
 */
export function lireIntention(sujet: string, corps: string, portail: boolean): Intention | null {
  const texte = `${sujet}\n${corps}`.trim();
  if (texte === '') return null;

  const loue = premiere(texte, LOUE);
  if (loue !== null) return { statut: 'rented', phrase: loue };

  const refus = premiere(texte, REFUS);
  if (refus !== null) return { statut: 'rejected', phrase: refus };

  const confirmee = premiere(texte, VISITE_CONFIRMEE);
  if (confirmee !== null) {
    const date = dateCitee(texte);
    // Une confirmation sans date lisible ne fixe rien : on ne prétend pas
    // connaître un rendez-vous dont on ne sait pas dire le jour.
    if (date !== null) return { statut: 'visitScheduled', phrase: confirmee, dateCitee: date };
    return { statut: 'visitOffered', phrase: confirmee };
  }

  const proposee = premiere(texte, VISITE_PROPOSEE);
  if (proposee !== null) {
    const date = dateCitee(texte);
    return {
      statut: 'visitOffered',
      phrase: proposee,
      ...(date === null ? {} : { dateCitee: date }),
    };
  }

  if (portail) {
    const accuse = premiere(texte, ACCUSE_PORTAIL);
    return accuse === null ? null : { statut: 'contacted', phrase: accuse };
  }

  // Une agence qui écrit a répondu : c'est le plancher, pas un défaut. La
  // phrase montrée vient du CORPS — un sujet est le plus souvent notre propre
  // objet renvoyé en « Re: », qui ne dit rien de ce que l'agence répond.
  const source = corps.trim() === '' ? sujet : corps;
  return { statut: 'replied', phrase: phraseContenant(source, 0, 0) };
}
