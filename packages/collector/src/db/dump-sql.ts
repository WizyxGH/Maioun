/**
 * Une base SQLite écrite en SQL ordinaire, pour la garder ailleurs.
 *
 * À PART DE LA COMMANDE (`cli/dump.ts`) parce que c'est ici que tout peut
 * casser en silence : une valeur mal échappée ne fait pas d'erreur, elle fait
 * une sauvegarde qui se relit sans broncher avec une chaîne tronquée dedans.
 * Ces trois fonctions sont donc testées séparément.
 */

/** Une table ou un index, tels que `sqlite_master` les rend. */
export interface ObjetSchema {
  readonly name: string;
  readonly sql: string;
}

/**
 * Les tables, PARENTS D'ABORD.
 *
 * Sept d'entre elles portent des clés étrangères. SQLite ne les vérifie pas
 * par défaut, mais D1 si : insérer `listing_user_state` avant `listings` y
 * échouerait. Trier coûte quinze lignes et évite d'avoir à poser un PRAGMA que
 * telle ou telle plateforme refusera.
 */
export function ordonnerTables(tables: readonly ObjetSchema[]): ObjetSchema[] {
  const parents = new Map(
    tables.map((table) => [
      table.name,
      [...table.sql.matchAll(/references\s+"?([a-z_][a-z0-9_]*)"?/gi)]
        .map((trouve) => trouve[1] as string)
        // Une table qui se référence elle-même n'impose aucun ordre.
        .filter((nom) => nom !== table.name),
    ]),
  );
  const rendu: ObjetSchema[] = [];
  const placees = new Set<string>();
  const enCours = new Set<string>();

  const visiter = (nom: string): void => {
    const table = tables.find((candidate) => candidate.name === nom);
    if (table === undefined || placees.has(nom)) return;
    // Un cycle de références ne se trie pas. On s'arrête là plutôt que de
    // boucler sans fin : l'ordre obtenu reste bon pour tout le reste.
    if (enCours.has(nom)) return;
    enCours.add(nom);
    for (const parent of parents.get(nom) ?? []) visiter(parent);
    enCours.delete(nom);
    placees.add(nom);
    rendu.push(table);
  };

  for (const table of tables) visiter(table.name);
  return rendu;
}

/** Une valeur SQLite, écrite comme un littéral SQL. */
export function litteralSql(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return 'NULL';
  if (typeof valeur === 'number' || typeof valeur === 'bigint') return String(valeur);
  if (valeur instanceof ArrayBuffer) return `X'${Buffer.from(valeur).toString('hex')}'`;
  if (ArrayBuffer.isView(valeur)) {
    return `X'${Buffer.from(valeur.buffer, valeur.byteOffset, valeur.byteLength).toString('hex')}'`;
  }
  const texte = String(valeur);
  // UN ZÉRO BINAIRE COUPERAIT LA CHAÎNE en silence chez la plupart des lecteurs
  // de SQL. Le cas est rare, mais une perte muette est exactement ce qu'une
  // sauvegarde ne doit pas produire : on passe par l'hexadécimal, que SQLite
  // relit à l'identique.
  if (texte.includes('\u0000')) {
    return `CAST(X'${Buffer.from(texte, 'utf8').toString('hex')}' AS TEXT)`;
  }
  return `'${texte.split("'").join("''")}'`;
}

/** Taille visée d'un INSERT : assez gros pour aller vite, assez petit pour
 *  qu'aucun lecteur ne cale sur une instruction démesurée. */
const PAQUET_OCTETS = 256 * 1024;

/**
 * Les `INSERT` d'une table, découpés en instructions de taille raisonnable.
 *
 * Une seule instruction pour 2 678 annonces ferait plusieurs mégaoctets, et
 * tous les outils ne l'avalent pas — `wrangler d1 import` le premier.
 */
export function instructionsInsert(
  table: string,
  colonnes: readonly string[],
  lignes: Iterable<readonly unknown[]>,
  paquetOctets = PAQUET_OCTETS,
): string[] {
  const entete = `INSERT INTO "${table}" (${colonnes.map((nom) => `"${nom}"`).join(', ')}) VALUES`;
  const rendu: string[] = [];
  let tampon: string[] = [];
  let taille = 0;

  const vider = (): void => {
    if (tampon.length === 0) return;
    rendu.push(`${entete}\n${tampon.join(',\n')};`);
    tampon = [];
    taille = 0;
  };

  for (const ligne of lignes) {
    const tuple = `  (${ligne.map(litteralSql).join(', ')})`;
    tampon.push(tuple);
    taille += tuple.length;
    if (taille >= paquetOctets) vider();
  }
  vider();
  return rendu;
}
