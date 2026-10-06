/**
 * Connexion à la base (§27).
 *
 * Projet 100% local : un fichier SQLite via `@libsql/client` (protocole libsql,
 * utilisé ici en mode fichier — aucun service cloud). La base de test tourne en
 * mémoire. Aucune configuration, aucun compte, aucun jeton n'est requis, ce qui
 * rend la CI possible sur un dépôt public et garantit que les tests exercent le
 * vrai chemin de code sans jamais toucher de données réelles (§52).
 */

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient, type Client } from '@libsql/client';

export type Database = Client;

/**
 * Base locale par défaut : `<racine du dépôt>/data/local.db`.
 *
 * Le chemin est résolu depuis CE fichier et non depuis le répertoire courant :
 * les CLI des différents packages (collecte, serveur local) doivent tous
 * tomber sur LE MÊME fichier, quel que soit leur répertoire d'exécution.
 * `data/` est dans le `.gitignore` : rien de collecté n'atteint le dépôt (§26).
 */
export function defaultLocalDatabaseUrl(): string {
  // dist/db/client.js → ../../../../data = racine du dépôt.
  const dataDir = fileURLToPath(new URL('../../../../data/', import.meta.url));
  mkdirSync(dataDir, { recursive: true });
  return `file:${dataDir}local.db`;
}

export interface DatabaseOptions {
  readonly url: string;
  readonly authToken?: string;
}

/**
 * Ouvre une connexion : fichier SQLite local, `:memory:` (tests), ou base
 * Turso distante (mode cloud optionnel, §28).
 *
 * @throws si l'URL pointe vers une base distante sans jeton — mieux vaut
 *         échouer immédiatement qu'écrire dans le vide.
 */
export function openDatabase(options: DatabaseOptions): Database {
  const isRemote = options.url.startsWith('libsql://') || options.url.startsWith('https://');
  if (isRemote && (options.authToken === undefined || options.authToken === '')) {
    throw new Error('TURSO_AUTH_TOKEN est requis pour une base distante (voir .env.example).');
  }

  const client = createClient({
    url: options.url,
    ...(options.authToken !== undefined && options.authToken !== ''
      ? { authToken: options.authToken }
      : {}),
  });
  if (isRemote) return avecReprise(client);
  // WAL : lectures et écritures simultanées sans blocage — le serveur local
  // peut servir l'interface PENDANT qu'une collecte écrit (sinon, risque de
  // « database is locked »). Fichier local uniquement ; best-effort.
  if (options.url.startsWith('file:')) {
    client.execute('PRAGMA journal_mode = WAL').catch(() => {
      /* pragma non supporté : on garde le mode par défaut */
    });
  }
  return client;
}

/** Où la collecte va écrire, et par quelle règle. */
export interface DatabaseTarget {
  /**
   * `turso` : la base que lit le site. `memory` : les tests. `local` : un
   * fichier sur cette machine, QUE PLUS AUCUNE INTERFACE NE LIT.
   */
  readonly kind: 'turso' | 'local' | 'memory';
  readonly url: string;
}

/**
 * Décide de la cible SANS l'ouvrir.
 *
 * Séparé de l'ouverture pour que les appelants puissent le DIRE avant d'écrire.
 * Le repli local est devenu un piège silencieux le jour où le serveur local a
 * été retiré : une collecte sans `TURSO_DATABASE_URL` annonce « 42 annonces
 * collectées » et les range dans un fichier qu'aucun écran ne saura ouvrir. On
 * a cherché la panne du côté des sources, alors que les données étaient
 * simplement ailleurs.
 *
 * Le repli n'est pas retiré pour autant : il reste la bonne façon d'essayer un
 * nouveau scraper sans toucher à la base de production. Ce qui devait
 * disparaître, c'est son silence.
 *
 * Priorités : tests (§52) → `TURSO_DATABASE_URL` → `DATABASE_URL` → fichier
 * local par défaut.
 */
export function databaseTarget(env: NodeJS.ProcessEnv = process.env): DatabaseTarget {
  if (env['NODE_ENV'] === 'test' || env['VITEST'] === 'true') {
    return { kind: 'memory', url: env['TEST_DATABASE_URL'] ?? ':memory:' };
  }

  // TRAVAILLER ENTIÈREMENT HORS DE TURSO, et sans toucher au `.env`.
  //
  // Le quota mensuel de lectures a été épuisé le 24 septembre 2026 : la base
  // distante a tout refusé, et rien ne permettait de se rabattre sur un fichier
  // local — `TURSO_DATABASE_URL` l'emportait toujours, et `.env` la rechargeait
  // à chaque commande. Il fallait commenter une ligne du `.env` pour collecter
  // chez soi, ce qu'on oublie ensuite de remettre.
  //
  // L'interrupteur est EXPLICITE et se lit dans le journal de chaque commande :
  // une collecte qui écrit dans un fichier local en croyant nourrir la
  // production serait pire que pas de collecte du tout.
  if (env['MAIOUN_LOCAL'] === '1') {
    const chosen = env['DATABASE_URL'];
    return {
      kind: 'local',
      url: chosen !== undefined && chosen !== '' ? chosen : defaultLocalDatabaseUrl(),
    };
  }

  const turso = env['TURSO_DATABASE_URL'];
  if (turso !== undefined && turso !== '') return { kind: 'turso', url: turso };

  const url = env['DATABASE_URL'];
  return { kind: 'local', url: url !== undefined && url !== '' ? url : defaultLocalDatabaseUrl() };
}

/** Ouvre la base désignée par l'environnement. Voir `databaseTarget`. */
export function openDatabaseFromEnv(env: NodeJS.ProcessEnv = process.env): Database {
  const target = databaseTarget(env);
  return target.kind === 'turso'
    ? openDatabase({ url: target.url, authToken: env['TURSO_AUTH_TOKEN'] })
    : openDatabase({ url: target.url });
}

/**
 * Une coupure de transport : la requête n'a pas obtenu de réponse de la base.
 * libsql la rend telle quelle (`TypeError: fetch failed`) ou l'enveloppe.
 */
function coupureDeTransport(error: unknown): boolean {
  for (let courant = error, profondeur = 0; profondeur < 4; profondeur += 1) {
    if (!(courant instanceof Error)) return false;
    if (courant.message.includes('fetch failed')) return true;
    courant = courant.cause;
  }
  return false;
}

/** Une instruction qui ne fait que lire : la rejouer ne change rien en base. */
function seulementLecture(statement: unknown): boolean {
  const sql = typeof statement === 'string' ? statement : (statement as { sql?: unknown }).sql;
  return typeof sql === 'string' && /^\s*SELECT\b/i.test(sql);
}

/**
 * Une LECTURE coupée en route est retentée une fois.
 *
 * LA PREMIÈRE REQUÊTE APRÈS UN LONG CALCUL TOMBAIT, À CHAQUE PASSAGE. Le
 * dédoublonnage occupe le processus une demi-minute sans parler à la base ;
 * la connexion gardée ouverte est fermée de l'autre côté entre-temps, et la
 * requête suivante part dessus : « fetch failed ». Quinze passages de suite le
 * 2026-10-06, toujours sur la lecture des baisses de loyer — aucune baisse
 * n'était donc plus signalée —, et une collecte complète perdue la veille sur
 * la lecture qui précède l'écriture des occurrences. La requête d'après, sur
 * une connexion neuve, passait.
 *
 * LES ÉCRITURES NE SONT PAS REJOUÉES : rien ne dit qu'une écriture coupée n'a
 * pas été appliquée, et l'historique des loyers la compterait deux fois.
 */
export function avecReprise(client: Client): Client {
  const rejouer = async <T>(lecture: boolean, appel: () => Promise<T>): Promise<T> => {
    try {
      return await appel();
    } catch (error) {
      if (!lecture || !coupureDeTransport(error)) throw error;
      return appel();
    }
  };
  return new Proxy(client, {
    get(cible, nom, recepteur) {
      if (nom === 'execute') {
        return (...args: Parameters<Client['execute']>) =>
          rejouer(seulementLecture(args[0]), () => cible.execute(...args));
      }
      if (nom === 'batch') {
        return (...args: Parameters<Client['batch']>) =>
          rejouer(args[1] === 'read', () => cible.batch(...args));
      }
      const valeur: unknown = Reflect.get(cible, nom, recepteur);
      return typeof valeur === 'function'
        ? (valeur as (...args: unknown[]) => unknown).bind(cible)
        : valeur;
    },
  });
}
