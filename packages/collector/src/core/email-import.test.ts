/**
 * LA LECTURE INCRÉMENTALE, ET SES GARDE-FOUS.
 *
 * Tout se joue sur une question : que redemande-t-on au serveur ? Ces tests
 * vérifient la PLAGE envoyée à IMAP et le repère rendu, sans réseau — le client
 * est injecté (§59). Les fixtures sont anonymes : adresses `@example.invalid`,
 * aucun nom, aucun numéro réel.
 */

import { describe, expect, it } from 'vitest';
import { fetchAlertEmails, parseBookmark, type ImapLike } from './email-import.js';
import type { ImapConfig } from '../config.js';

const CONFIG: ImapConfig = {
  host: 'imap.example.invalid',
  port: 993,
  user: 'boite@example.invalid',
  password: 'secret',
  mailbox: 'INBOX',
};

/** Un message brut minimal, avec son destinataire. */
function message(uid: number, sujet: string): { source: Buffer; uid: number } {
  const brut = [
    // Expéditeur fictif : le tri par expéditeur se fait côté serveur IMAP, ce
    // faux client ne filtre rien — l'en-tête n'est là que pour la forme.
    'From: annonces@alertes.portail.example.invalid',
    'Delivered-To: boite@example.invalid',
    `Subject: ${sujet}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    `<html><body><p>${sujet}</p></body></html>`,
  ].join('\r\n');
  return { source: Buffer.from(brut, 'utf8'), uid };
}

interface Faux {
  readonly client: ImapLike;
  /** Les plages demandées, dans l'ordre. */
  readonly ranges: unknown[];
}

function fauxClient(options: {
  uidValidity?: unknown;
  uidNext?: number;
  messages?: readonly { source: Buffer; uid: number }[];
  /** UID dont la lecture doit échouer (source illisible). */
  cassé?: number;
  mailboxAbsente?: boolean;
}): Faux {
  const ranges: unknown[] = [];
  const messages = options.messages ?? [];
  const client: ImapLike = {
    connect: () => Promise.resolve(),
    getMailboxLock: () => Promise.resolve({ release: () => undefined }),
    mailbox:
      options.mailboxAbsente === true
        ? false
        : { uidValidity: options.uidValidity ?? 1n, uidNext: options.uidNext ?? 100 },
    fetch: (range) => {
      ranges.push(range);
      return (async function* () {
        for (const m of messages) {
          // Un message « cassé » : sa source est illisible (flux coupé côté
          // serveur, message tronqué) et sa lecture lève.
          if (m.uid === options.cassé) {
            yield {
              uid: m.uid,
              get source(): Buffer {
                throw new Error('flux interrompu');
              },
            };
            continue;
          }
          yield m;
        }
      })();
    },
    logout: () => Promise.resolve(),
  };
  return { client, ranges };
}

const REPÈRE = (lastUid: number, uidValidity = '1'): string =>
  JSON.stringify({
    uidValidity,
    lastUid,
    senders: 'bien-ici,bienici,leboncoin,logic-immo,pap.fr,seloger',
  });

describe('fetchAlertEmails — première lecture', () => {
  it('demande la fenêtre entière et rend un repère posé sur UIDNEXT', async () => {
    const faux = fauxClient({ uidNext: 42, messages: [message(40, 'A'), message(41, 'B')] });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      sinceDays: 4,
      clientFactory: () => faux.client,
    });

    expect(batch.fullRead).toBe(true);
    expect(batch.emails).toHaveLength(2);
    expect(faux.ranges[0]).toMatchObject({ since: expect.any(Date) });
    expect(faux.ranges[0]).not.toHaveProperty('uid');
    // Le repère monte à UIDNEXT-1 : tout le dossier a été CONSIDÉRÉ, y compris
    // les messages d'expéditeurs non suivis, qu'il ne faut pas re-balayer.
    expect(batch.bookmark).toEqual({
      uidValidity: '1',
      lastUid: 41,
      senders: 'bien-ici,bienici,leboncoin,logic-immo,pap.fr,seloger',
    });
  });
});

describe('fetchAlertEmails — lecture incrémentale', () => {
  it('ne redemande que ce qui a suivi le dernier UID lu', async () => {
    const faux = fauxClient({ uidNext: 60, messages: [message(55, 'neuf')] });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      sinceDays: 4,
      bookmark: parseBookmark(REPÈRE(50)),
      clientFactory: () => faux.client,
    });

    expect(batch.fullRead).toBe(false);
    expect(faux.ranges[0]).toMatchObject({ uid: '51:*' });
    expect(batch.emails).toHaveLength(1);
    expect(batch.bookmark?.lastUid).toBe(59);
  });

  it('avance le repère même quand aucun message ne correspond', async () => {
    // Sinon la même plage serait re-balayée sans fin.
    const faux = fauxClient({ uidNext: 80, messages: [] });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      bookmark: parseBookmark(REPÈRE(50)),
      clientFactory: () => faux.client,
    });
    expect(batch.emails).toEqual([]);
    expect(batch.bookmark?.lastUid).toBe(79);
  });
});

describe('fetchAlertEmails — ce qui force une relecture complète', () => {
  it('un UIDVALIDITY différent : les anciens UID ne désignent plus rien', async () => {
    const faux = fauxClient({ uidValidity: 777n, uidNext: 60 });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      bookmark: parseBookmark(REPÈRE(50, '1')),
      clientFactory: () => faux.client,
    });
    expect(batch.fullRead).toBe(true);
    expect(faux.ranges[0]).not.toHaveProperty('uid');
    expect(batch.bookmark?.uidValidity).toBe('777');
  });

  it('une boîte vidée ou reconstruite : le repère dépasse UIDNEXT', async () => {
    const faux = fauxClient({ uidNext: 10 });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      bookmark: parseBookmark(REPÈRE(50)),
      clientFactory: () => faux.client,
    });
    expect(batch.fullRead).toBe(true);
    expect(batch.bookmark?.lastUid).toBe(9);
  });

  it('un expéditeur ajouté à la liste suivie : ses messages sont sous le repère', async () => {
    const dépassé = JSON.stringify({ uidValidity: '1', lastUid: 50, senders: 'seloger' });
    const faux = fauxClient({ uidNext: 60 });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      bookmark: parseBookmark(dépassé),
      clientFactory: () => faux.client,
    });
    expect(batch.fullRead).toBe(true);
  });
});

describe('fetchAlertEmails — ne jamais perdre un message', () => {
  it('un message illisible retient le repère juste avant lui', async () => {
    const faux = fauxClient({
      uidNext: 60,
      messages: [message(51, 'lu'), message(52, 'cassé'), message(53, 'lu aussi')],
      cassé: 52,
    });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      bookmark: parseBookmark(REPÈRE(50)),
      clientFactory: () => faux.client,
    });
    // 51 et 53 sont bien remontés, mais le repère s'arrête à 51 : 52 et la
    // suite seront repris, quitte à relire.
    expect(batch.emails).toHaveLength(2);
    expect(batch.bookmark?.lastUid).toBe(51);
  });

  it('une connexion refusée ne rend aucun repère : le précédent tient', async () => {
    const client: ImapLike = {
      connect: () => Promise.reject(new Error('Invalid credentials')),
      getMailboxLock: () => Promise.reject(new Error('jamais')),
      fetch: () => {
        throw new Error('jamais');
      },
      logout: () => Promise.resolve(),
    };
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      bookmark: parseBookmark(REPÈRE(50)),
      clientFactory: () => client,
    });
    expect(batch.emails).toEqual([]);
    expect(batch.bookmark).toBeNull();
  });

  it('un dossier illisible ne rend aucun repère non plus', async () => {
    const faux = fauxClient({ uidNext: 60 });
    const client: ImapLike = {
      ...faux.client,
      fetch: () => {
        throw new Error('NO [SERVERBUG]');
      },
    };
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      bookmark: parseBookmark(REPÈRE(50)),
      clientFactory: () => client,
    });
    expect(batch.bookmark).toBeNull();
  });

  it('un serveur qui ne publie pas d’UIDVALIDITY : pas de repère, relecture', async () => {
    const faux = fauxClient({ mailboxAbsente: true, messages: [message(1, 'A')] });
    const batch = await fetchAlertEmails({
      config: CONFIG,
      log: () => undefined,
      clientFactory: () => faux.client,
    });
    expect(batch.emails).toHaveLength(1);
    expect(batch.bookmark).toBeNull();
  });
});

describe('parseBookmark', () => {
  it('relit un repère bien formé', () => {
    expect(parseBookmark('{"uidValidity":"3","lastUid":9,"senders":"a,b"}')).toEqual({
      uidValidity: '3',
      lastUid: 9,
      senders: 'a,b',
    });
  });

  it('refuse tout le reste plutôt que de deviner (§17)', () => {
    expect(parseBookmark(null)).toBeNull();
    expect(parseBookmark('')).toBeNull();
    expect(parseBookmark('pas du json')).toBeNull();
    expect(parseBookmark('"une chaîne"')).toBeNull();
    expect(parseBookmark('{"uidValidity":3,"lastUid":9,"senders":"a"}')).toBeNull();
    expect(parseBookmark('{"uidValidity":"3","lastUid":9.5,"senders":"a"}')).toBeNull();
    expect(parseBookmark('{"uidValidity":"3","lastUid":9}')).toBeNull();
  });
});
