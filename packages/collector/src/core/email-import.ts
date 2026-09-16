/**
 * Transport IMAP pour l'import des alertes e-mail (§6, §10, §26).
 *
 * Se connecte à la boîte mail de l'utilisateur en LECTURE SEULE, récupère les
 * e-mails du dossier configuré et rend leur HTML. Aucune modification de la
 * boîte (pas de marquage « lu »), aucune connexion à un portail. Ne lève
 * jamais : toute erreur réseau/auth rend une liste vide (§69).
 *
 * LA LECTURE EST INCRÉMENTALE, et c'était tout le problème. Chaque passage
 * redemandait la fenêtre entière — quatre jours — et retéléchargeait les mêmes
 * messages : 12 161 messages descendus en quatorze jours pour 140 réellement
 * reçus, soit 40 % du trafic du projet pour 5 % de ses annonces neuves (mesuré
 * le 2026-09-16). On ne demande donc plus que ce qui est arrivé DEPUIS le
 * dernier passage, repéré par l'UID du dernier message considéré.
 *
 * TROIS CHOSES PEUVENT FAIRE MENTIR UN UID, et chacune force une relecture
 * complète de la fenêtre plutôt qu'un saut :
 *
 *   - `UIDVALIDITY` a changé : le serveur a renuméroté la boîte, les anciens
 *     UID ne désignent plus rien (RFC 3501) ;
 *   - le repère est au-delà d'`UIDNEXT` : boîte vidée ou reconstruite ;
 *   - la liste des expéditeurs suivis a changé : les messages d'un expéditeur
 *     nouvellement ajouté sont déjà passés sous le repère, et personne ne les
 *     relirait jamais.
 *
 * ET LE REPÈRE N'AVANCE QUE SUR CE QUI A ÉTÉ LU. Un message qui casse à
 * l'analyse arrête l'avance juste avant lui : le passage suivant le reprend.
 * Une erreur de lecture, elle, ne rend aucun repère du tout — le cœur garde
 * alors le précédent.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ALERT_SENDER_MATCHES } from '@maioun/shared';
import { RECIPIENT_HEADERS, addressesIn } from './alert-recipients.js';
import type { ImapConfig } from '../config.js';

/**
 * Où la lecture en était restée. Sérialisé tel quel dans le repère de la source
 * (`ScrapeResult.memo`) : aucun secret, aucune donnée personnelle.
 */
export interface MailboxBookmark {
  /** `UIDVALIDITY` du dossier : s'il change, les UID d'avant ne valent plus. */
  readonly uidValidity: string;
  /** Dernier UID considéré — le suivant reprend à `lastUid + 1`. */
  readonly lastUid: number;
  /** Empreinte des expéditeurs suivis : en ajouter un force une relecture. */
  readonly senders: string;
}

export interface EmailImportOptions {
  readonly config: ImapConfig;
  /** Journalisation (le `log` du contexte de scraper convient). */
  readonly log: (event: string, fields?: Record<string, unknown>) => void;
  /** Ne lire que les e-mails reçus depuis N jours (défaut 7). */
  readonly sinceDays?: number;
  /** Repère du passage précédent, ou `null` pour tout relire. */
  readonly bookmark?: MailboxBookmark | null;
  /** Injection pour les tests (§59) — un client compatible ImapFlow. */
  readonly clientFactory?: (config: ImapConfig) => ImapLike;
}

/** L'état du dossier ouvert, tel qu'ImapFlow le publie après le verrou. */
export interface MailboxStatus {
  readonly uidValidity?: unknown;
  readonly uidNext?: number;
}

/** Sous-ensemble d'ImapFlow réellement utilisé (facilite l'injection en test). */
export interface ImapLike {
  connect(): Promise<void>;
  getMailboxLock(
    mailbox: string,
    opts?: { readonly readOnly?: boolean },
  ): Promise<{ release(): void }>;
  /** Dossier ouvert : `false` tant qu'aucun verrou n'est pris. */
  readonly mailbox?: MailboxStatus | false;
  fetch(
    range: unknown,
    query: { readonly source: true; readonly uid: true },
  ): AsyncIterable<{ readonly source?: Buffer; readonly uid?: number }>;
  logout(): Promise<void>;
}

/**
 * Un e-mail d'alerte, et à qui il était adressé.
 *
 * LES DESTINATAIRES NE SONT PAS UN ORNEMENT. Le collecteur lit UNE boîte, celle
 * du projet, où chaque compte fait suivre ses alertes. Rien dans le CORPS ne dit
 * de qui vient le message — un digest SeLoger a la même apparence pour tout le
 * monde. Seule l'adresse visée le dit.
 */
export interface AlertEmail {
  /** Corps HTML, ou texte à défaut. */
  readonly body: string;
  /** Adresses citées par les en-têtes de destination, en minuscules. */
  readonly recipients: readonly string[];
}

/** Ce qu'un passage a lu, et où il s'est arrêté. */
export interface AlertEmailBatch {
  readonly emails: AlertEmail[];
  /**
   * Repère à garder pour le prochain passage, ou `null` si ce passage n'a rien
   * pu conclure (connexion refusée, dossier illisible). `null` veut dire
   * « garde le précédent », jamais « repars de zéro ».
   */
  readonly bookmark: MailboxBookmark | null;
  /** `true` si la fenêtre entière a été relue, faute de repère utilisable. */
  readonly fullRead: boolean;
}

/** Les expéditeurs suivis, sous une forme comparable d'un passage à l'autre. */
function sendersFingerprint(): string {
  return [...ALERT_SENDER_MATCHES].sort().join(',');
}

/**
 * Le repère est-il encore valable sur ce dossier ? Au moindre doute, non : une
 * relecture complète coûte une fenêtre de messages, un saut à tort les perd
 * pour toujours.
 */
function bookmarkUsable(
  bookmark: MailboxBookmark | null | undefined,
  uidValidity: string,
  uidNext: number,
): boolean {
  if (bookmark === null || bookmark === undefined) return false;
  if (uidValidity === '' || bookmark.uidValidity !== uidValidity) return false;
  if (bookmark.senders !== sendersFingerprint()) return false;
  if (!Number.isInteger(bookmark.lastUid) || bookmark.lastUid <= 0) return false;
  // `uidNext` inconnu (0) : on ne peut pas vérifier que la boîte n'a pas été
  // reconstruite — le repère reste utilisable, la recherche `n:*` ne rendra
  // simplement rien si la boîte est vide.
  return uidNext === 0 || bookmark.lastUid < uidNext;
}

/** Relit un repère sérialisé ; `null` dès qu'il n'a pas la forme attendue. */
export function parseBookmark(raw: string | null): MailboxBookmark | null {
  if (raw === null || raw.trim() === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<MailboxBookmark>;
  if (typeof candidate.uidValidity !== 'string') return null;
  if (typeof candidate.lastUid !== 'number' || !Number.isInteger(candidate.lastUid)) return null;
  if (typeof candidate.senders !== 'string') return null;
  return {
    uidValidity: candidate.uidValidity,
    lastUid: candidate.lastUid,
    senders: candidate.senders,
  };
}

/**
 * Les adresses visées par un message, tous en-têtes de destination confondus.
 *
 * Aucun fournisseur ne les écrit tous, et c'est `Delivered-To` — écrit par le
 * serveur qui LIVRE — qui porte l'adresse réellement visée.
 */
function recipientsOf(headers: Map<string, unknown>): string[] {
  return [
    ...new Set(
      RECIPIENT_HEADERS.flatMap((header) => {
        const value = headers.get(header);
        if (typeof value === 'string') return addressesIn(value);
        return addressesIn((value as { text?: string } | undefined)?.text ?? null);
      }),
    ),
  ];
}

/** Ce qu'une lecture de messages a retenu, et jusqu'où elle est sûre. */
interface ReadOutcome {
  /** Plus grand UID lu SANS INCIDENT avant le premier échec. */
  readonly highestRead: number;
  /** Premier UID qu'on n'a pas su lire, ou `null`. */
  readonly firstFailedUid: number | null;
}

/**
 * Lit les messages d'un flux et empile leurs corps.
 *
 * UN MESSAGE ILLISIBLE N'ARRÊTE PAS LES AUTRES, mais il RETIENT le repère :
 * sans cela il serait sauté définitivement, et personne ne le saurait (§69).
 */
async function readMessages(
  flux: AsyncIterable<{ readonly source?: Buffer; readonly uid?: number }>,
  emails: AlertEmail[],
  depuis: number,
  log: EmailImportOptions['log'],
): Promise<ReadOutcome> {
  let highestRead = depuis;
  let firstFailedUid: number | null = null;

  for await (const message of flux) {
    const uid = typeof message.uid === 'number' ? message.uid : 0;
    try {
      const source = message.source;
      if (source !== undefined) {
        const parsed = await simpleParser(source);
        const body = typeof parsed.html === 'string' ? parsed.html : (parsed.text ?? '');
        if (body !== '') {
          emails.push({ body, recipients: recipientsOf(parsed.headers as Map<string, unknown>) });
        }
      }
    } catch (error) {
      if (firstFailedUid === null && uid > 0) firstFailedUid = uid;
      log('email.message_failed', {
        error: error instanceof Error ? error.message : 'erreur inconnue',
      });
      continue;
    }
    if (firstFailedUid === null && uid > highestRead) highestRead = uid;
  }

  return { highestRead, firstFailedUid };
}

/**
 * Récupère les e-mails d'alerte non encore lus : leur corps, à qui ils allaient,
 * et où reprendre au passage suivant.
 */
export async function fetchAlertEmails(options: EmailImportOptions): Promise<AlertEmailBatch> {
  const { config, log } = options;
  const sinceDays = options.sinceDays ?? 7;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const client: ImapLike =
    options.clientFactory?.(config) ??
    new ImapFlow({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: config.user, pass: config.password },
      logger: false,
    });

  const emails: AlertEmail[] = [];
  try {
    await client.connect();
  } catch (error) {
    log('email.connect_failed', {
      error: error instanceof Error ? error.message : 'erreur inconnue',
    });
    return { emails, bookmark: null, fullRead: false };
  }

  let bookmark: MailboxBookmark | null = null;
  let fullRead = true;
  try {
    // Lecture seule : jamais de marquage « lu » ni d'altération de la boîte.
    const lock = await client.getMailboxLock(config.mailbox, { readOnly: true });
    try {
      const status = client.mailbox === false ? undefined : client.mailbox;
      // `UIDVALIDITY` est un entier 32 bits qu'ImapFlow rend en BigInt : on le
      // compare sous forme de texte, seule forme qui traverse le JSON intacte.
      const uidValidity = status?.uidValidity === undefined ? '' : String(status.uidValidity);
      const uidNext = Number(status?.uidNext ?? 0);
      const previous = options.bookmark ?? null;
      const incremental = bookmarkUsable(previous, uidValidity, uidNext);
      fullRead = !incremental;

      // VIE PRIVÉE (§26) : on ne lit QUE les e-mails PROVENANT des portails —
      // jamais les mails personnels de l'utilisateur, même en lisant INBOX. Le
      // filtrage se fait côté serveur IMAP (recherche par expéditeur).
      //
      // `since` reste posé même en incrémental : un message ancien déplacé dans
      // le dossier y prendrait un UID neuf, et rouvrirait une annonce périmée.
      const senders = ALERT_SENDER_MATCHES.map((from) => ({ from }));
      const range =
        incremental && previous !== null
          ? { uid: `${previous.lastUid + 1}:*`, since, or: senders }
          : { since, or: senders };

      log('email.range', {
        incremental,
        ...(incremental && previous !== null ? { fromUid: previous.lastUid + 1 } : {}),
        uidNext,
      });

      const lu = await readMessages(
        client.fetch(range, { source: true, uid: true }),
        emails,
        previous !== null && incremental ? previous.lastUid : 0,
        log,
      );
      const { highestRead, firstFailedUid } = lu;

      /**
       * JUSQU'OÙ LA BOÎTE A ÉTÉ CONSIDÉRÉE — et non « jusqu'au dernier message
       * retenu ». La recherche a examiné tout le dossier jusqu'à `uidNext - 1`,
       * y compris les messages d'expéditeurs non suivis, qu'aucun passage
       * ultérieur n'aura à revoir. S'arrêter au dernier message GARDÉ ferait
       * re-balayer la même plage indéfiniment.
       */
      const ceiling = uidNext > 0 ? uidNext - 1 : highestRead;
      const lastUid = firstFailedUid === null ? Math.max(ceiling, highestRead) : firstFailedUid - 1;
      if (uidValidity !== '' && lastUid > 0) {
        bookmark = { uidValidity, lastUid, senders: sendersFingerprint() };
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    log('email.fetch_failed', {
      error: error instanceof Error ? error.message : 'erreur inconnue',
    });
    // Le passage n'a rien pu conclure : pas de repère, donc le précédent tient.
    bookmark = null;
  } finally {
    try {
      await client.logout();
    } catch {
      /* déconnexion best-effort */
    }
  }

  log('email.fetched', { emails: emails.length, fullRead });
  return { emails, bookmark, fullRead };
}
