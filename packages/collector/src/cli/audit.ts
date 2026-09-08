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
    console.log('');
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
