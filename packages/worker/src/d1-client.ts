/**
 * LA BASE DE SECOURS, quand Turso refuse de lire.
 *
 * Turso compte les lignes lues et bloque TOUT au-delà du plafond mensuel. Le
 * 24 septembre 2026 le site publié n'a plus rien eu à montrer pendant des
 * jours : l'application entière dépendait d'une base qu'un plafond peut
 * fermer, et le seul recours était d'allumer un PC chez soi.
 *
 * D1 tourne sur la même plateforme que ce Worker, ne coûte rien, et surtout
 * SE REMET À ZÉRO CHAQUE JOUR au lieu de chaque mois : le même accident y
 * coûterait une soirée, pas quatre semaines.
 *
 * EN LECTURE SEULE, ET C'EST LE POINT IMPORTANT. D1 ne porte qu'une COPIE,
 * prise par `pnpm db:dump`. Y écrire pendant que Turso est fermé fabriquerait
 * deux bases qui divergent, dont aucune ne serait la bonne : un favori posé
 * ici disparaîtrait au retour de l'autre, sans que rien ne le signale. Le
 * secours sert donc à CONSULTER — et refuse le reste, en le disant.
 */

import type { Client, InStatement, ResultSet, Row, Value } from '@libsql/client/web';

/** Ce que la copie ne fera pas, et pourquoi. */
const REFUS_ECRITURE =
  'Base de secours en lecture seule : Turso refuse les lectures, et la copie ' +
  "n'est qu'une copie. Écrire ici créerait deux bases divergentes.";

/**
 * Une requête qui ne fait que lire ?
 *
 * On ne devine pas : seuls `SELECT` et les `WITH …` qui s'y terminent passent.
 * Ce qui n'est pas reconnu est refusé, parce que l'inverse — laisser filer ce
 * qu'on n'a pas su classer — est exactement la faute qu'on veut éviter.
 */
function lectureSeule(sql: string): boolean {
  const debut = sql
    .replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/g, '')
    .slice(0, 8)
    .toUpperCase();
  return debut.startsWith('SELECT') || debut.startsWith('WITH');
}

/** La requête et ses paramètres, quelle que soit la forme reçue. */
function normaliser(statement: InStatement): { sql: string; args: unknown[] } {
  if (typeof statement === 'string') return { sql: statement, args: [] };
  const args = statement.args ?? [];
  if (!Array.isArray(args)) {
    // Les paramètres NOMMÉS (`:nom`) ne sont utilisés nulle part ici. Refuser
    // vaut mieux que de les traduire au jugé.
    throw new Error('Base de secours : paramètres nommés non pris en charge.');
  }
  return { sql: statement.sql, args };
}

/**
 * Une ligne lisible PAR NOM comme PAR RANG.
 *
 * D1 rend des objets, libsql des tableaux qui portent aussi les noms. Tout le
 * code d'ici lit par nom, mais le type promet les deux : le tenir évite qu'un
 * appel légitime échoue un jour sans raison compréhensible.
 */
function ligne(colonnes: readonly string[], objet: Record<string, unknown>): Row {
  const valeurs = colonnes.map((nom) => (objet[nom] ?? null) as Value);
  for (const [rang, nom] of colonnes.entries()) {
    Object.defineProperty(valeurs, nom, { value: valeurs[rang], enumerable: true });
  }
  return valeurs as unknown as Row;
}

async function executer(base: D1Database, statement: InStatement): Promise<ResultSet> {
  const { sql, args } = normaliser(statement);
  if (!lectureSeule(sql)) throw new Error(REFUS_ECRITURE);

  const prepare = base.prepare(sql);
  const rendu = await (args.length > 0 ? prepare.bind(...args) : prepare).all();
  const resultats = (rendu.results ?? []) as Record<string, unknown>[];
  // Les colonnes se lisent sur la première ligne. Sans ligne, il n'y a rien à
  // nommer — et rien qui les demande.
  const colonnes = resultats.length > 0 ? Object.keys(resultats[0] as object) : [];
  const rows = resultats.map((objet) => ligne(colonnes, objet));

  return {
    columns: colonnes,
    // Le type des colonnes n'est lu nulle part ; D1 ne le donne pas.
    columnTypes: colonnes.map(() => ''),
    rows,
    rowsAffected: 0,
    lastInsertRowid: undefined,
    toJSON: () => ({ columns: colonnes, rows: resultats }),
  } satisfies ResultSet;
}

/** Ce que le secours ne sait pas faire, dit d'une seule voix. */
function indisponible(): never {
  throw new Error(REFUS_ECRITURE);
}

/**
 * Un client de la forme attendue par `route()`, adossé à D1.
 *
 * Les membres inutilisés lèvent plutôt que de rendre une valeur plausible :
 * si le chemin de secours en appelait un, mieux vaut une panne nommée qu'un
 * résultat vide pris pour une réponse.
 */
export function clientDeSecours(base: D1Database): Client {
  return {
    execute: (statement: InStatement) => executer(base, statement),
    batch: indisponible,
    migrate: indisponible,
    transaction: indisponible,
    executeMultiple: indisponible,
    sync: indisponible,
    close: () => undefined,
    closed: false,
    protocol: 'http',
  } as unknown as Client;
}
