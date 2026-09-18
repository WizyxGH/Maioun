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
import { createRepository } from '../db/repository.js';
import { createLogger } from '../core/logger.js';
import { loadDotEnv, PUBLIC_CONFIG } from '../config.js';
import { VANISH_WINDOW_DAYS } from '../pipeline.js';
import { vanishingSources } from '../scheduler/scheduler.js';
import {
  cadence,
  conditionalReach,
  spendByGroup,
  spendBySource,
} from '../scheduler/request-budget.js';
import { ALL_SCRAPERS } from '../sources/index.js';
import { wantedAdEvidence } from '../normalization/housing-wanted.js';
import { agencyCoverage, sourceAliases } from '../sources/agency-names.js';
import { DORMANT_CANDIDATES } from '../sources/dormant.js';
import { outOfReach } from '../sources/out-of-reach.js';
import { SHORT_COVERAGE_WARNING } from '../sources/shared/announced-total.js';

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

/** Les sources dont le descripteur porte ce contact d'agence, en liste SQL. */
function withAgency(field: 'phone' | 'email'): string {
  const ids = ALL_SCRAPERS.filter((s) => s.descriptor.agencyContact?.[field] != null).map(
    (s) => `'${s.descriptor.id}'`,
  );
  return ids.length === 0 ? "''" : ids.join(',');
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
  // Le standard de l'agence, repris de son descripteur au regroupement, compte.
  { label: 'tél', sql: `contact_phone IS NOT NULL OR source_id IN (${withAgency('phone')})` },
  { label: 'mail', sql: `contact_email IS NOT NULL OR source_id IN (${withAgency('email')})` },
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
 * LES SOURCES EN SOUFFRANCE — celles qu'il faut aller réparer.
 *
 * La couverture ci-dessus dit ce qui manque dans les annonces ; elle ne dit
 * rien des sources qui n'en rapportent plus. Trois pannes ont été repérées par
 * l'utilisateur et non par le système : une source à l'arrêt six jours, un
 * quartier faux pendant des semaines, une couverture réduite à une commune sur
 * treize. Ce tableau range les symptômes du plus parlant au plus discret.
 *
 * UNE AGENCE VIDE N'EST PAS UNE AGENCE EN PANNE : celles qui n'ont aucune
 * annonce active ET dont le dernier passage l'a constaté (`empty`) sont
 * comptées à part, sans être nommées.
 *
 * PLUS SENSIBLE QUE L'ALERTE, ET C'EST VOULU. La notification ne part qu'après
 * trois passages interrompus d'affilée, parce qu'elle réveille quelqu'un ; ce
 * tableau se lit quand on l'a demandé, et se trompe donc du bon côté.
 */
async function reportAilingSources(db: Database): Promise<void> {
  /**
   * Les sources qui n'annoncent qu'une fois — une boîte aux lettres, un
   * bulletin — ne re-listent jamais leur stock : elles rendent zéro annonce
   * dès qu'il n'est rien arrivé, et se portent parfaitement bien. Le cycle de
   * vie les écarte déjà pour la même raison.
   */
  const oneShot = new Set(
    ALL_SCRAPERS.filter((one) => one.descriptor.oneShotListings === true).map(
      (one) => one.descriptor.id,
    ),
  );
  const rows = await db.execute(`
    SELECT s.source_id AS src, s.health, s.last_success_at AS succes,
           s.consecutive_errors AS erreurs, s.last_full_pass_at AS complet,
           r.stop_reason AS motif, r.listings_found AS rendues, r.started_at AS passage,
           (SELECT COUNT(*) FROM occurrences o
             WHERE o.source_id = s.source_id AND o.lifecycle != 'inactive') AS stock,
           (SELECT MAX(started_at) FROM collection_runs c
             WHERE c.source_id = s.source_id AND c.listings_new > 0) AS dernierNeuf
      FROM source_state s
      LEFT JOIN (
        SELECT source_id, stop_reason, listings_found, started_at FROM (
          SELECT source_id, stop_reason, listings_found, started_at,
                 ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY started_at DESC) AS rang
            FROM collection_runs
        ) WHERE rang = 1
      ) r ON r.source_id = s.source_id
     ORDER BY s.source_id
  `);

  const now = Date.now();
  const jours = (value: unknown): number =>
    value == null ? Infinity : (now - Date.parse(String(value))) / 86_400_000;

  const vides: string[] = [];
  const souffrantes: { src: string; motif: string }[] = [];
  for (const row of rows.rows) {
    const src = String(row['src']);
    const stock = Number(row['stock'] ?? 0);
    const motif = row['motif'] == null ? null : String(row['motif']);

    if (oneShot.has(src)) continue;
    if (stock === 0 && motif === 'empty') {
      vides.push(src);
      continue;
    }
    if (row['health'] !== 'healthy') {
      souffrantes.push({ src, motif: `santé « ${String(row['health'])} »` });
      continue;
    }
    if (motif !== null && ['blocked', 'tooManyErrors', 'rateLimited'].includes(motif)) {
      souffrantes.push({ src, motif: `dernier passage interrompu (${motif})` });
      continue;
    }
    // Un stock qui vit sans qu'aucun passage ne le revoie : c'est le profil de
    // la source cassée en silence — les annonces restent « actives » parce que
    // le cycle de vie refuse de conclure, et plus rien n'entre.
    if (stock >= 10 && Number(row['rendues'] ?? 0) === 0) {
      souffrantes.push({ src, motif: `${stock} annonces en ligne, 0 rendue au dernier passage` });
      continue;
    }
    const silence = jours(row['dernierNeuf']);
    if (stock >= 10 && silence >= 3) {
      souffrantes.push({
        src,
        motif:
          silence === Infinity
            ? `${stock} annonces en ligne, jamais rien de neuf`
            : `rien de neuf depuis ${silence.toFixed(1)} j (${stock} annonces en ligne)`,
      });
      continue;
    }
    if (jours(row['succes']) >= 2) {
      souffrantes.push({
        src,
        motif: `aucun passage réussi depuis ${jours(row['succes']).toFixed(1)} j`,
      });
    }
  }

  console.log('\n── Sources en souffrance ─────────────────────────────────────');
  if (souffrantes.length === 0) {
    console.log('   aucune. (Ce qui mérite d’être vérifié : la surveillance est-elle branchée ?)');
  }
  for (const one of souffrantes) {
    console.log(`   ${one.src.padEnd(28)} ${one.motif}`);
  }
  console.log(
    `\n   ${vides.length} source(s) sans annonce à louer, et qui le DISENT : ce n’est pas une panne.`,
  );
}

/** Profondeur du bilan de collecte : assez pour lisser les jours creux. */
const BUDGET_WINDOW_DAYS = 7;

/** Combien de sources nommer dans le classement des dépensières. */
const BUDGET_TOP = 12;

/**
 * OÙ PART LE BUDGET DE REQUÊTES, ET CE QU'IL RAPPORTE.
 *
 * On règle la collecte sur des intervalles sans jamais savoir ce qu'une requête
 * achète. Ce tableau donne l'indicateur qui décide : les requêtes dépensées par
 * annonce JAMAIS VUE, et la part des passages qui n'en rapportent aucune.
 *
 * Relevé du 2026-09-18 sur sept jours : vingt requêtes par annonce neuve,
 * 94 % des passages sans la moindre découverte, et 80 % du budget qui y part.
 *
 * Il dit aussi ce que la cadence a réellement valu — un cycle manqué coûte plus
 * cher que n'importe quel intervalle — et jusqu'où portent les requêtes
 * conditionnelles, pour qu'on cesse d'espérer d'elles ce qu'elles ne peuvent
 * pas donner.
 */
async function reportRequestBudget(db: Database): Promise<void> {
  const depuis = new Date(Date.now() - BUDGET_WINDOW_DAYS * 86_400_000).toISOString();

  const runs = (
    await db.execute({
      sql: `SELECT source_id, started_at, finished_at, request_count
              FROM collection_runs WHERE started_at >= ?`,
      args: [depuis],
    })
  ).rows.map((r) => ({
    sourceId: String(r['source_id']),
    startedAtMs: Date.parse(String(r['started_at'])),
    finishedAtMs: Date.parse(String(r['finished_at'])),
    requestCount: Number(r['request_count'] ?? 0),
  }));

  console.log('\n── Où part le budget de requêtes ─────────────────────────────');
  if (runs.length === 0) {
    console.log(`   aucun passage depuis ${BUDGET_WINDOW_DAYS} jours.`);
    return;
  }

  const discoveries = (
    await db.execute({
      sql: `SELECT source_id, first_seen_at FROM occurrences WHERE first_seen_at >= ?`,
      args: [depuis],
    })
  ).rows.map((r) => ({
    sourceId: String(r['source_id']),
    atMs: Date.parse(String(r['first_seen_at'])),
  }));

  const spends = spendBySource(runs, discoveries);
  const familles = new Map(ALL_SCRAPERS.map((one) => [one.descriptor.id, one.descriptor.kind]));
  const parFamille = spendByGroup(spends, (id) => familles.get(id) ?? 'inconnue');
  const rythme = cadence(runs.map((run) => run.startedAtMs));
  const jours = Math.max(rythme.windowHours / 24, 1 / 24);

  const part = (a: number, b: number): string =>
    b === 0 ? '  – ' : `${Math.round((100 * a) / b)} %`;
  const cout = (value: number | null): string => (value === null ? '   ∞' : value.toFixed(1));

  console.log(
    `   ${'famille'.padEnd(15)} ${'sources'.padStart(7)} ${'passages'.padStart(8)}` +
      ` ${'requêtes'.padStart(8)} ${'req/j'.padStart(6)} ${'neuves'.padStart(6)}` +
      ` ${'req/neuve'.padStart(9)} ${'passages stériles'.padStart(17)} ${'budget perdu'.padStart(12)}`,
  );
  const ligneGroupe = (nom: string, one: (typeof parFamille)[number]): string =>
    `   ${nom.slice(0, 15).padEnd(15)} ${String(one.sources).padStart(7)}` +
    ` ${String(one.passes).padStart(8)} ${String(one.requests).padStart(8)}` +
    ` ${(one.requests / jours).toFixed(0).padStart(6)} ${String(one.discoveries).padStart(6)}` +
    ` ${cout(one.requestsPerDiscovery).padStart(9)}` +
    ` ${part(one.sterilePasses, one.passes).padStart(17)}` +
    ` ${part(one.sterileRequests, one.requests).padStart(12)}`;
  for (const one of parFamille) console.log(ligneGroupe(one.group, one));
  const tout = spendByGroup(spends, () => 'TOTAL')[0];
  if (tout !== undefined) console.log(ligneGroupe('TOTAL', tout));

  // Classées par ce qu'une annonce neuve leur coûte, pas par leur volume : une
  // source discrète qui dépense pour rien se voit ainsi aussi bien qu'un portail.
  const assezVues = spends.filter((one) => one.requests >= 100);
  const gouffres = [...assezVues].sort(
    (a, b) =>
      (b.requestsPerDiscovery ?? Infinity) - (a.requestsPerDiscovery ?? Infinity) ||
      b.requests - a.requests,
  );
  console.log(`\n   Ce qu'une annonce neuve coûte, source par source (≥ 100 requêtes) :`);
  for (const one of gouffres.slice(0, BUDGET_TOP)) {
    console.log(
      `   ${one.sourceId.slice(0, 28).padEnd(28)} ${String(one.requests).padStart(6)} req` +
        ` ${String(one.discoveries).padStart(5)} neuve(s)` +
        ` ${cout(one.requestsPerDiscovery).padStart(8)} req/neuve` +
        ` ${part(one.sterilePasses, one.passes).padStart(6)} de passages stériles`,
    );
  }

  console.log(
    `\n   Cadence : ${rythme.cycles} cycles en ${rythme.windowHours.toFixed(0)} h` +
      ` (${rythme.cyclesPerDay.toFixed(0)}/jour), écart médian ${rythme.medianGapMinutes.toFixed(0)} min.`,
  );
  console.log(
    `   ${rythme.holes} silence(s) de plus de 25 min, jusqu'à ${rythme.longestGapMinutes.toFixed(0)} min :` +
      ` ${Math.round(100 * rythme.holeShare)} % du temps sans collecte.`,
  );

  const cache = (await db.execute('SELECT url FROM http_cache')).rows.map((r) => String(r['url']));
  const portee = conditionalReach(
    cache,
    ALL_SCRAPERS.filter((one) => one.descriptor.enabled).map((one) => one.descriptor.domain),
  );
  console.log(
    `   Requêtes conditionnelles : ${portee.coveredSources}/${portee.totalSources} sources rendent` +
      ` un validateur (${portee.cachedUrls} adresses, ${portee.origins} origines).` +
      ` Ailleurs, le site n'en donne aucun — rien à y gagner.`,
  );
}

/** Ce qu'un arrêt de passage dit de la couverture du catalogue. */
const SHORT_STOPS = new Set(['incomplete', 'maxPages', 'maxListings']);
const FULL_STOPS = new Set(['completed', 'empty', 'notModified', 'knownTerritory']);

/**
 * LISONS-NOUS TOUT CE QUE CHAQUE SITE PUBLIE ?
 *
 * La question n'était posée nulle part. On voyait les annonces entrer, jamais
 * celles qui n'entraient pas : un gabarit sans pagination a laissé vingt
 * annonces dehors pendant des semaines, et c'est l'utilisateur qui l'a
 * découvert. Un trou de couverture ne se signale pas tout seul — il faut le
 * demander au site, qui sait ce qu'il publie.
 *
 * TROIS ÉTATS, ET PAS DEUX. « Courte » est le défaut à corriger. « Hors de
 * notre portée » n'en est pas un : une agence qui diffuse sur les portails ce
 * qu'elle ne met pas chez elle est lue en entier, et son stock nous parvient
 * par ailleurs. Les confondre rendrait 100 % inatteignable et l'indicateur
 * inutile.
 *
 * « PLEINE » SE LIT COMME ELLE EST ÉCRITE : rien ne dit qu'il en manque.
 * C'est prouvé là où le site publie son total — le passage compare et se
 * plaint —, et seulement présumé ailleurs. Une source qui s'arrête sur un
 * plafond, elle, le dit, et compte comme courte.
 */
async function reportCatalogCoverage(db: Database): Promise<void> {
  const rows = await db.execute(
    `SELECT r.source_id AS src, r.stop_reason AS stop, r.warnings AS warnings, r.started_at AS le
       FROM collection_runs r
       JOIN (SELECT source_id, MAX(started_at) AS last FROM collection_runs GROUP BY source_id) d
         ON d.source_id = r.source_id AND d.last = r.started_at`,
  );
  const last = new Map(rows.rows.map((one) => [String(one['src']), one]));

  const courtes: string[] = [];
  const muettes: string[] = [];
  let pleines = 0;
  const sources = ALL_SCRAPERS.map((one) => one.descriptor).filter((one) => one.enabled);
  const horsPortee = sources.filter((one) => outOfReach(one.id) !== null);

  for (const descriptor of sources) {
    if (outOfReach(descriptor.id) !== null) continue;
    const run = last.get(descriptor.id);
    if (run === undefined) {
      muettes.push(`${descriptor.id.padEnd(28)} jamais lancée`);
      continue;
    }
    const stop = String(run['stop'] ?? '');
    const short = String(run['warnings'] ?? '').includes(SHORT_COVERAGE_WARNING);
    if (short || SHORT_STOPS.has(stop)) {
      const raison = short ? 'le site annonce plus que ce que nous lisons' : `arrêt sur ${stop}`;
      courtes.push(`${descriptor.id.padEnd(28)} ${raison}`);
    } else if (FULL_STOPS.has(stop)) {
      pleines += 1;
    } else {
      muettes.push(`${descriptor.id.padEnd(28)} dernier passage : ${stop}`);
    }
  }

  console.log('\n── Couverture du catalogue, source par source ────────────────');
  console.log(`   ${sources.length} source(s) active(s), au dernier passage de chacune :`);
  console.log(
    `     couverture pleine    ${String(pleines).padStart(5)}   rien ne dit qu'il en manque`,
  );
  console.log(
    `     couverture courte    ${String(courtes.length).padStart(5)}   c'est ici que l'effort paie`,
  );
  console.log(
    `     hors de notre portée ${String(horsPortee.length).padStart(5)}   consignées : ne se recomptent pas`,
  );
  console.log(
    `     sans verdict         ${String(muettes.length).padStart(5)}   passage en échec, ou jamais lancée`,
  );

  if (courtes.length > 0) {
    console.log('\n   Couverture courte :');
    for (const one of courtes) console.log(`     ${one}`);
  }
  if (horsPortee.length > 0) {
    console.log('\n   Hors de notre portée — le stock nous arrive par un autre chemin :');
    for (const descriptor of horsPortee) {
      const verdict = outOfReach(descriptor.id);
      if (verdict === null) continue;
      console.log(
        `     ${descriptor.id.padEnd(28)} ${verdict.reason} (relevé ${verdict.checkedOn})` +
          ` — nous parvient par ${verdict.reachedBy.join(', ')}`,
      );
    }
  }
  if (muettes.length > 0) {
    console.log('\n   Sans verdict :');
    for (const one of muettes) console.log(`     ${one}`);
  }
}

/**
 * Les annonces de DEMANDE encore en base : quelqu'un qui cherche un logement,
 * pas qui en propose un.
 *
 * Le filet de la collecte les écarte à l'entrée, mais seulement pour les
 * sources qui en hébergent ; ailleurs il se contente de signaler. Et une règle
 * qui écarte sur du texte doit se relire : ce tableau est là pour qu'on puisse
 * vérifier, ligne à ligne, qu'elle n'a pas pris une vraie offre.
 */
async function reportWantedAds(db: Database): Promise<void> {
  const rows = await db.execute(
    `SELECT id, source_id, source_url, title, json_extract(payload, '$.description') AS texte
     FROM occurrences WHERE ${ACTIVE}`,
  );
  const found = rows.rows
    .map((r) => ({ row: r, motif: wantedAdEvidence(r['title'] as string, r['texte'] as string) }))
    .filter((one) => one.motif !== null);

  console.log('\n── Demandes de logement (annonces à l’envers) ────────────────');
  console.log(line('reconnues parmi les annonces vivantes', found.length, rows.rows.length));
  for (const { row: r, motif } of found) {
    console.log(
      `     ${String(r['source_id']).padEnd(16)} « ${String(motif)} »  ${String(r['source_url'])}`,
    );
  }
}

/**
 * LES AGENCES QU'ON VOIT SANS LES COLLECTER.
 *
 * Confiance Immobilière était dans nos données depuis des semaines — son nom
 * signe des annonces Bien'ici — sans être une source. Personne ne l'a su avant
 * qu'on la demande par son nom. Or une source directe publie plus tôt qu'un
 * portail et rend des champs que le portail coupe.
 *
 * À LA DEMANDE, PAS EN ALERTE : c'est une liste de travail, pas un incident.
 *
 * Seules comptent les annonces vues par un PORTAIL ou un agrégateur. Le site
 * d'une agence nomme évidemment cette agence : la compter dirait seulement
 * qu'on la collecte déjà.
 *
 * Le rapprochement des noms est celui de `sources/agency-names.ts`, et il
 * penche du côté du signalement : en montrer une déjà couverte coûte une ligne,
 * en manquer une coûte une source.
 */
async function reportAgencyCoverage(db: Database): Promise<void> {
  const portals = ALL_SCRAPERS.map((one) => one.descriptor)
    .filter((one) => one.kind === 'portal' || one.kind === 'aggregator')
    .map((one) => `'${one.id}'`);

  const rows = await db.execute(
    `SELECT source_id AS src, contact_agency AS nom,
            COUNT(DISTINCT group_id) AS total,
            COUNT(DISTINCT CASE WHEN ${ACTIVE} THEN group_id END) AS vivantes
       FROM occurrences
      WHERE contact_agency IS NOT NULL AND TRIM(contact_agency) != ''
        AND source_id IN (${portals.join(',') || "''"})
      GROUP BY source_id, contact_agency`,
  );

  const sightings = rows.rows.map((row) => ({
    name: String(row['nom']),
    sourceId: String(row['src']),
    listings: Number(row['total'] ?? 0),
  }));
  const active = new Map<string, number>();
  for (const row of rows.rows) {
    const key = String(row['nom']);
    active.set(key, (active.get(key) ?? 0) + Number(row['vivantes'] ?? 0));
  }

  const coverage = agencyCoverage(
    sightings,
    ALL_SCRAPERS.flatMap((one) => sourceAliases(one.descriptor)),
    DORMANT_CANDIDATES.flatMap((one) =>
      sourceAliases({ name: one.name, id: one.id, domain: new URL(one.origin).hostname }),
    ),
  );

  console.log('\n── Agences vues par les portails, sans source directe ─────────');
  console.log(
    `   ${sightings.length} couple(s) source–agence, ` +
      `${coverage.uncovered.length} agence(s) sans source directe.`,
  );
  console.log(
    `   ${'agence'.padEnd(46)} ${'annonces'.padStart(8)} ${'dont vivantes'.padStart(13)}`,
  );
  for (const group of coverage.uncovered) {
    const live = group.names.reduce((sum, name) => sum + (active.get(name) ?? 0), 0);
    const label = group.names.join(' / ').slice(0, 46);
    console.log(
      `   ${label.padEnd(46)} ${String(group.listings).padStart(8)} ${String(live).padStart(13)}` +
        `   [${group.sources.join(' ')}]`,
    );
  }
  if (coverage.studied.length > 0) {
    console.log(
      `\n   Déjà étudiées et en veille (voir sources/dormant.ts) : ` +
        coverage.studied.map((one) => one.names[0] ?? '').join(', '),
    );
  }
}

/**
 * CE QUE CHAQUE SOURCE PERD ENTRE DEUX PASSAGES.
 *
 * Une annonce découverte puis jamais revue a vécu moins longtemps que l'écart
 * entre deux de nos passages : pour une attrapée, il s'en est probablement
 * échappé une autre, jamais vue. C'est le seul chiffre qui dise ce que la
 * cadence nous coûte, et il décide des places du cycle — d'où ce tableau, pour
 * qu'on puisse vérifier à qui elles vont.
 *
 * Deux gardes, sans quoi le chiffre désignerait les sources bancales : le
 * retrait doit être acquis (`missing_runs`), et un lot d'annonces apparues au
 * même instant ne compte pas — c'est une page de catalogue qui tourne.
 */
async function reportVanishing(db: Database): Promise<void> {
  const repository = createRepository(db);
  const rates = await repository.vanishRates(
    VANISH_WINDOW_DAYS,
    PUBLIC_CONFIG.missingRunsBeforeInactive,
  );
  const retenues = vanishingSources(rates);

  const lignes = [...rates.entries()]
    .filter(([, rate]) => rate.vanished > 0)
    .sort(([, a], [, b]) => b.vanished / b.retired - a.vanished / a.retired);

  console.log('\n── Annonces perdues entre deux passages (14 jours) ───────────');
  if (lignes.length === 0) {
    console.log('   aucune. Toutes les annonces retirées avaient été revues au moins deux fois.');
    return;
  }
  console.log(
    `   ${'source'.padEnd(28)} ${'retirées'.padStart(8)} ${'perdues'.padStart(8)} ${'part'.padStart(6)}`,
  );
  for (const [sourceId, rate] of lignes) {
    const part = Math.round((rate.vanished / rate.retired) * 100);
    const marque = retenues.has(sourceId) ? ' ← passe en tête du cycle' : '';
    console.log(
      `   ${sourceId.slice(0, 28).padEnd(28)} ${String(rate.retired).padStart(8)}` +
        ` ${String(rate.vanished).padStart(8)} ${`${part} %`.padStart(6)}${marque}`,
    );
  }
  const perdues = lignes.reduce((sum, [, rate]) => sum + rate.vanished, 0);
  console.log(
    `\n   ${perdues} annonce(s) attrapées de justesse en 14 jours. Autant, environ,` +
      ` nous ont échappé sans jamais être vues.`,
  );
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
    await reportAilingSources(db);
    await reportVanishing(db);
    await reportRequestBudget(db);
    await reportCatalogCoverage(db);
    await reportAgencyCoverage(db);
    await reportWantedAds(db);
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
