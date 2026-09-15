/**
 * Commande `pnpm audit:data` — ce que l'inventaire sait, et ce qu'il ignore.
 *
 * On pilote la collecte à l'aveugle : on voit les annonces une par une, jamais
 * la couverture d'ensemble. Ces chiffres disent où porter l'effort, et une
 * source qui cesse de publier une donnée ne se remarque pas autrement.
 *
 * LECTURE SEULE : rien n'est écrit, la commande peut tourner à tout moment.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openDatabaseFromEnv, databaseTarget, type Database } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { createLogger } from '../core/logger.js';
import { loadDotEnv } from '../config.js';
import { ALL_SCRAPERS } from '../sources/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../../../database/migrations');

/** L'adresse n'est pas une colonne : elle vit dans le `payload`, avec ce qui porte l'accord entre sources. */
const ADDRESS = "json_extract(payload, '$.address.value')";

const ACTIVE = "lifecycle != 'inactive'";

/** Un libellé, un compte, et sa part du total. */
function line(label: string, count: unknown, total: number): string {
  const n = Number(count ?? 0);
  const share = total === 0 ? 0 : Math.round((n / total) * 100);
  return `   ${label.padEnd(42)} ${String(n).padStart(5)}  ${String(share).padStart(3)} %`;
}

async function row(db: Database, sql: string): Promise<Record<string, unknown>> {
  return ((await db.execute(sql)).rows[0] ?? {}) as Record<string, unknown>;
}

/**
 * Où sont les annonces — la donnée qui manque le plus.
 *
 * Sans rue ni quartier, pas de point sur la carte, pas de temps de trajet, et
 * pas les trente points qu'une adresse commune vaut au dédoublonnage.
 */
async function reportLocation(db: Database, total: number): Promise<void> {
  const place = await row(
    db,
    `SELECT
       SUM(CASE WHEN ${ADDRESS} IS NOT NULL AND ${ADDRESS} != '' THEN 1 ELSE 0 END) AS rue,
       SUM(CASE WHEN (${ADDRESS} IS NULL OR ${ADDRESS} = '')
                 AND district IS NOT NULL AND district != '' THEN 1 ELSE 0 END) AS quartier,
       SUM(CASE WHEN (${ADDRESS} IS NULL OR ${ADDRESS} = '')
                 AND (district IS NULL OR district = '')
                 AND city IS NOT NULL AND city != '' THEN 1 ELSE 0 END) AS ville,
       SUM(CASE WHEN (${ADDRESS} IS NULL OR ${ADDRESS} = '')
                 AND (district IS NULL OR district = '')
                 AND (city IS NULL OR city = '') THEN 1 ELSE 0 END) AS rien,
       SUM(CASE WHEN latitude IS NOT NULL THEN 1 ELSE 0 END) AS placees
     FROM listings WHERE ${ACTIVE}`,
  );

  console.log('── Localisation ──────────────────────────────────────────────');
  console.log(line('rue précise', place['rue'], total));
  console.log(line('quartier seulement', place['quartier'], total));
  console.log(line('commune seulement', place['ville'], total));
  console.log(line('AUCUNE localisation', place['rien'], total));
  console.log(line('placées sur la carte (géocodées)', place['placees'], total));

  // Par source : c'est là qu'on sait quel parseur reprendre.
  const bySource = await db.execute(
    `SELECT o.source_id AS src, COUNT(DISTINCT l.id) AS n
     FROM listings l JOIN occurrences o ON o.group_id = l.id
     WHERE l.${ACTIVE}
       AND (json_extract(l.payload, '$.address.value') IS NULL
            OR json_extract(l.payload, '$.address.value') = '')
     GROUP BY o.source_id ORDER BY n DESC LIMIT 8`,
  );
  if (bySource.rows.length === 0) return;
  console.log('\n   Sans rue, par source :');
  for (const source of bySource.rows) {
    console.log(line(`  ${String(source['src'])}`, source['n'], total));
  }
}

/** Les champs qu'une annonce devrait porter, et qui manquent. */
async function reportFields(db: Database, total: number): Promise<void> {
  const f = await row(
    db,
    `SELECT
       SUM(CASE WHEN price IS NULL THEN 1 ELSE 0 END) AS loyer,
       SUM(CASE WHEN area IS NULL THEN 1 ELSE 0 END) AS surface,
       SUM(CASE WHEN rooms IS NULL THEN 1 ELSE 0 END) AS pieces,
       SUM(CASE WHEN available_at IS NULL THEN 1 ELSE 0 END) AS dispo,
       SUM(CASE WHEN landlord_kind = 'unknown' THEN 1 ELSE 0 END) AS bailleur
     FROM listings WHERE ${ACTIVE}`,
  );
  console.log('\n── Champs manquants ──────────────────────────────────────────');
  console.log(line('sans loyer', f['loyer'], total));
  console.log(line('sans surface', f['surface'], total));
  console.log(line('sans nombre de pièces', f['pieces'], total));
  console.log(line('sans date de disponibilité', f['dispo'], total));
  console.log(line('bailleur non identifié', f['bailleur'], total));
}

/**
 * Colocation et ameublement — deux filtres que l'utilisateur règle, et qui ne
 * peuvent écarter que ce dont on est sûr (§17). Ce qui est indéterminé passe.
 */
async function reportFlatShare(db: Database, total: number): Promise<void> {
  const f = await row(
    db,
    `SELECT
       SUM(CASE WHEN flat_share IS NULL THEN 1 ELSE 0 END) AS inconnue,
       SUM(CASE WHEN flat_share = 1 THEN 1 ELSE 0 END) AS oui,
       SUM(CASE WHEN furnished IS NULL THEN 1 ELSE 0 END) AS meuble
     FROM listings WHERE ${ACTIVE}`,
  );
  console.log('\n── Colocation ────────────────────────────────────────────────');
  console.log(line('détectée (colocation = oui)', f['oui'], total));
  console.log(line('INDÉTERMINÉE (ni oui ni non)', f['inconnue'], total));
  console.log(line('ameublement indéterminé', f['meuble'], total));

  // Le profil qui échappe le plus : un grand logement proposé à la chambre ne
  // dit pas toujours « colocation ».
  const suspects = await db.execute(
    `SELECT title, area, rooms, price FROM listings
     WHERE ${ACTIVE} AND flat_share IS NOT 1 AND area >= 60 AND rooms >= 3
     ORDER BY area DESC LIMIT 10`,
  );
  console.log(`\n   Grandes surfaces non marquées colocation (10 plus grandes) :`);
  for (const s of suspects.rows) {
    const title = String(s['title'] ?? '').slice(0, 50);
    console.log(
      `     ${String(s['area'])} m² · ${String(s['rooms'])} p. · ${String(s['price'] ?? '—')} € — ${title}`,
    );
  }
}

/**
 * Ce que chaque source remplit, champ par champ.
 *
 * Les chiffres globaux mélangent les portails, qui donnent tout, et les
 * petites agences, qui omettent la moitié : ils ne disent pas quel parseur
 * reprendre. Les logements seulement — un parking n'a ni pièces ni DPE.
 */
const FIELDS: readonly { readonly label: string; readonly sql: string }[] = [
  { label: 'loyer', sql: 'price IS NOT NULL' },
  { label: 'surf', sql: 'area IS NOT NULL' },
  { label: 'pièc', sql: 'rooms IS NOT NULL' },
  { label: 'desc', sql: "length(json_extract(payload, '$.description')) >= 200" },
  { label: 'phot', sql: "json_array_length(json_extract(payload, '$.imageUrls')) > 0" },
  { label: 'rue', sql: "address IS NOT NULL AND address != ''" },
  { label: 'quar', sql: "json_extract(payload, '$.district') IS NOT NULL" },
  { label: 'tél', sql: 'contact_phone IS NOT NULL' },
  { label: 'mail', sql: 'contact_email IS NOT NULL' },
  // La référence de l'agence, pas l'identifiant d'annonce recopié à défaut.
  { label: 'réf', sql: 'contact_reference IS NOT NULL AND contact_reference != source_ref' },
  { label: 'meub', sql: 'furnished IS NOT NULL' },
  {
    label: 'chrg',
    sql: "charges IS NOT NULL OR json_extract(payload, '$.chargesIncluded') IS NOT NULL",
  },
  { label: 'dépô', sql: "json_extract(payload, '$.deposit') IS NOT NULL" },
  { label: 'dpe', sql: "json_extract(payload, '$.dpe') IS NOT NULL" },
  { label: 'disp', sql: 'available_at IS NOT NULL' },
  { label: 'colo', sql: 'flat_share IS NOT NULL' },
];

/** En dessous, la case est signalée : le champ manque plus souvent qu'il n'est là. */
const WEAK_SHARE = 50;

async function reportSourceCoverage(db: Database): Promise<void> {
  const columns = FIELDS.map(
    (field, i) => `SUM(CASE WHEN ${field.sql} THEN 1 ELSE 0 END) AS f${i}`,
  ).join(',\n       ');
  const result = await db.execute(
    `SELECT source_id AS src, COUNT(*) AS n,
       ${columns}
     FROM occurrences
     WHERE ${ACTIVE} AND property_type NOT IN ('parking', 'commercial')
     GROUP BY source_id ORDER BY n DESC`,
  );

  console.log('\n── Couverture par source (logements actifs, % remplis) ───────');
  console.log(
    `   ${'source'.padEnd(26)} ${'n'.padStart(5)} ${FIELDS.map((f) => f.label.padStart(5)).join('')}`,
  );
  const totals = FIELDS.map(() => 0);
  let all = 0;
  for (const source of result.rows) {
    const n = Number(source['n']);
    all += n;
    const cells = FIELDS.map((_, i) => {
      const filled = Number(source[`f${i}`] ?? 0);
      totals[i]! += filled;
      const share = Math.round((filled / n) * 100);
      return `${share < WEAK_SHARE ? '·' : ' '}${String(share).padStart(3)} `;
    });
    console.log(
      `   ${String(source['src']).slice(0, 26).padEnd(26)} ${String(n).padStart(5)} ${cells.join('')}`,
    );
  }
  const overall = totals.map(
    (t) => `${String(all === 0 ? 0 : Math.round((t / all) * 100)).padStart(4)} `,
  );
  console.log(`   ${'TOUTES SOURCES'.padEnd(26)} ${String(all).padStart(5)} ${overall.join('')}`);
  console.log(`   · = moins de ${WEAK_SHARE} % des annonces de la source portent le champ.`);

  // Les sources inscrites qui ne rapportent aucun logement : panne muette, agence
  // vide, ou parseur qui ne reconnaît plus rien. Le registre fait foi, pas
  // `source_state`, qui ignore une source jamais lancée.
  const seen = new Set(result.rows.map((r) => String(r['src'])));
  const states = await db.execute('SELECT source_id, health, last_success_at FROM source_state');
  const stateOf = new Map(states.rows.map((r) => [String(r['source_id']), r]));
  const empty = ALL_SCRAPERS.map((s) => s.descriptor).filter((d) => d.enabled && !seen.has(d.id));
  if (empty.length === 0) return;
  console.log(`
   Sources actives sans aucun logement en base (${empty.length}) :`);
  for (const d of empty) {
    const state = stateOf.get(d.id);
    const last = state?.['last_success_at'];
    const since = last == null ? 'jamais réussie' : `succès ${String(last).slice(0, 10)}`;
    console.log(
      `     ${d.id.padEnd(28)} ${String(state?.['health'] ?? 'jamais lancée').padEnd(14)} ${since}`,
    );
  }
}

/**
 * Les réglages posés par compte.
 *
 * Plusieurs écrans ne s'affichent QUE si leur marque est absente — l'accueil
 * des nouveaux venus, la modale des nouveautés. Quand l'un d'eux « ne
 * s'affiche jamais », c'est ici que la réponse se trouve, et nulle part
 * ailleurs : la marque est posée, ou elle ne l'est pas.
 */
async function reportSettings(db: Database): Promise<void> {
  const rows = await db.execute(
    `SELECT user_id, key, substr(value, 1, 60) AS extrait, updated_at
     FROM app_settings ORDER BY user_id, key`,
  );
  console.log('\n── Réglages par compte ───────────────────────────────────────');
  if (rows.rows.length === 0) {
    console.log('   aucun réglage enregistré.');
    return;
  }
  for (const r of rows.rows) {
    console.log(
      `   ${String(r['user_id']).padEnd(10)} ${String(r['key']).padEnd(24)} ${String(r['extrait'])}`,
    );
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const db = openDatabaseFromEnv();
  try {
    await migrate(db, MIGRATIONS_DIR, createLogger({ minLevel: 'warn' }));
    console.log(`\n🔎 Audit de l'inventaire — base ${databaseTarget().kind}\n`);

    const total = Number(
      (await row(db, `SELECT COUNT(*) AS n FROM listings WHERE ${ACTIVE}`))['n'] ?? 0,
    );
    console.log(`   ${total} fiche(s) active(s) ou à vérifier.\n`);

    await reportLocation(db, total);
    await reportFields(db, total);
    await reportFlatShare(db, total);
    await reportSourceCoverage(db);
    await reportSettings(db);
    console.log('');
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
