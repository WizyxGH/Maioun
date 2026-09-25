/**
 * LES STATISTIQUES DE SUIVI (§33).
 *
 * Six requêtes agrégées, et rien d'autre : le marché d'un côté, l'activité de
 * QUELQU'UN de l'autre. Sorties de `routes.ts` parce que ce sont deux cents
 * lignes de SQL au milieu d'un routeur, et qu'elles ne partagent rien avec le
 * reste des routes.
 */

import type { Client } from '@libsql/client';
import { ONE_SHOT_SOURCES } from '@maioun/shared';
import { shareAlive, survivalCurve } from '../core/survival.js';

/**
 * @param userId Les chiffres d'ENGAGEMENT lui appartiennent : ce qu'il a vu,
 *   archivé, suivi, et les messages qu'il a envoyés. Sans lui, la page
 *   additionnait les gestes de tous les comptes — un compte y lisait l'activité
 *   des autres, et ses propres chiffres étaient faux.
 *
 *   LE MARCHÉ EST COMMUN, LA PERTINENCE NE L'EST PAS. Le nombre d'annonces
 *   actives ou louées décrit le marché ; « pertinentes » décrit un budget, une
 *   surface, des quartiers — donc quelqu'un. Ces chiffres se lisaient sur
 *   `listings.matches_criteria`, calculé par la collecte pour un seul compte :
 *   le second lisait le décompte du premier. Ils viennent désormais de
 *   `listing_user_score`, comme la liste et les alertes.
 */
/**
 * Au-delà, un passage livre du STOCK et non des nouveautés : un passage
 * ordinaire découvre 1 à 10 annonces par source, un premier passage ou un
 * rattrapage de 16 à plusieurs centaines (relevé du 2026-09-11).
 */
const STOCK_BATCH = 15;

export async function getStats(db: Client, userId: string): Promise<unknown> {
  // §33 : statistiques simples pour commencer, pas de modèle complexe.
  const [listings, engagement, contacts, outcomes, byTracking, bySource] = await Promise.all([
    db.execute({
      sql: `
      SELECT COUNT(*) AS total,
             -- « Pertinentes » ne compte QUE les annonces encore ACTIVES.
             -- Auparavant ce total incluait aussi les « possiblement
             -- inactives » — disparues de leur source depuis plusieurs
             -- collectes, donc probablement louées : le chiffre annonçait
             -- près du double d'opportunités réelles (§33, §17).
             SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND lifecycle = 'active'
                      AND COALESCE(us.archived, 0) = 0
                      AND rented = 0 THEN 1 ELSE 0 END) AS matching,
             -- Comptées à part : toujours affichées et consultables, mais à
             -- vérifier avant de s'en réjouir.
             SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND lifecycle = 'possiblyInactive'
                      AND COALESCE(us.archived, 0) = 0 AND rented = 0 THEN 1 ELSE 0 END) AS uncertain,
             SUM(CASE WHEN lifecycle = 'active' THEN 1 ELSE 0 END) AS active,
             SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND rented = 1 THEN 1 ELSE 0 END) AS rented
      -- La colonne listings.archived était lue ici : celle du temps où
      -- l'archivage était un fait sur la fiche. Ce qu'UN compte a rangé ne
      -- doit pas disparaître du décompte des autres.
      FROM listings
      LEFT JOIN listing_user_score sc ON sc.listing_id = listings.id AND sc.user_id = ?
      LEFT JOIN listing_user_state us ON us.listing_id = listings.id AND us.user_id = ?
    `,
      args: [userId, userId],
    }),
    db.execute({
      sql: `SELECT SUM(us.viewed) AS viewed, SUM(us.archived) AS archived
            FROM listing_user_state us
            JOIN listings l ON l.id = us.listing_id
            JOIN listing_user_score sc ON sc.listing_id = l.id AND sc.user_id = us.user_id
            WHERE us.user_id = ? AND sc.matches_criteria = 1`,
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT COUNT(*) AS total FROM contact_attempts WHERE user_id = ?',
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT outcome, COUNT(*) AS n FROM contact_attempts WHERE user_id = ? GROUP BY outcome',
      args: [userId],
    }),
    /**
     * LE SUIVI VIENT DE `listing_user_state`, et non plus de la colonne
     * `tracking` de `listings`. Celle-ci est le vestige du temps où il n'y
     * avait qu'un utilisateur : elle vaut « new » pour tout le monde, si bien
     * que la répartition affichée était celle d'un seul compte — le premier à
     * avoir touché la fiche.
     *
     * Les annonces sur lesquelles personne n'a rien fait n'ont PAS de ligne :
     * elles comptent pour « new », qui est bien leur état.
     */
    db.execute({
      sql: `SELECT COALESCE(us.tracking, 'new') AS tracking, COUNT(*) AS n
            FROM listings l
            LEFT JOIN listing_user_state us ON us.listing_id = l.id AND us.user_id = ?
            JOIN listing_user_score sc ON sc.listing_id = l.id AND sc.user_id = ?
            WHERE sc.matches_criteria = 1
            GROUP BY COALESCE(us.tracking, 'new')`,
      args: [userId, userId],
    }),
    db.execute(`
      SELECT source_id, COUNT(*) AS n FROM occurrences
      WHERE lifecycle IN ('active', 'possiblyInactive') GROUP BY source_id ORDER BY n DESC
    `),
  ]);

  const toMap = (rows: readonly Record<string, unknown>[], key: string): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const row of rows) map[String(row[key])] = Number(row['n']);
    return map;
  };

  // Historique de l'inventaire DE CE COMPTE, du plus ancien au plus récent
  // (§33). « Pertinentes » est un décompte personnel : la table en garde une
  // ligne par compte et par jour depuis la migration 0029.
  const history = await db.execute({
    sql: 'SELECT * FROM daily_stats WHERE user_id = ? ORDER BY day DESC LIMIT 90',
    args: [userId],
  });

  /**
   * COMBIEN DE TEMPS UNE ANNONCE RESTE DISPONIBLE — mesuré, pas supposé.
   *
   * Une annonce éteinte a vécu de sa découverte à sa dernière observation. Une
   * annonce ENCORE EN LIGNE n'a pas fini de vivre : elle compte pour « au moins
   * n jours » et non pour une disparition, faute de quoi la mesure ne compterait
   * que les mortes et sous-estimerait toujours (voir `core/survival.ts`).
   *
   * C'est un fait sur le MARCHÉ, pas sur une personne : aucune jointure de
   * compte ici, le chiffre est le même pour tout le monde.
   *
   * SEULES COMPTENT LES ANNONCES VUES NAÎTRE. Le stock déjà en ligne quand une
   * source entre dans la collecte — ses premières 24 h — ou qu'elle livre d'un
   * bloc (plus de `STOCK_BATCH` d'un coup : rattrapage, correctif de
   * pagination) avait souvent des semaines d'âge : le compter depuis notre
   * découverte gonflait la survie (87 % à J+7 affichés, 79 % sur les seules
   * nouvelles). Les sources à annonce unique en sont exclues aussi : leur fin
   * est posée par un minuteur, pas observée.
   *
   * La durée s'arrête à la DERNIÈRE OBSERVATION, lue sur les occurrences :
   * `listings.last_seen_at` n'est pas réécrit quand la fiche ne change pas.
   */
  const oneShot = ONE_SHOT_SOURCES.map(() => '?').join(',');
  const lifetimes = await db.execute({
    sql: `
      WITH debut AS (
        SELECT source_id, MIN(first_seen_at) AS debut FROM occurrences GROUP BY source_id
      ),
      lot AS (
        SELECT source_id, first_seen_at, COUNT(*) AS n
        FROM occurrences GROUP BY source_id, first_seen_at
      ),
      stock AS (
        SELECT o.group_id FROM occurrences o
        JOIN debut d ON d.source_id = o.source_id
        JOIN lot b ON b.source_id = o.source_id AND b.first_seen_at = o.first_seen_at
        JOIN listings l ON l.id = o.group_id AND l.first_seen_at = o.first_seen_at
        WHERE julianday(o.first_seen_at) - julianday(d.debut) < 1 OR b.n > ?
      ),
      vu AS (
        SELECT group_id, MAX(last_seen_at) AS vu FROM occurrences GROUP BY group_id
      )
      SELECT CASE WHEN l.lifecycle = 'inactive' OR l.rented = 1 THEN 1 ELSE 0 END AS ended,
             julianday(COALESCE(vu.vu, l.last_seen_at)) - julianday(l.first_seen_at) AS days
      FROM listings l
      LEFT JOIN vu ON vu.group_id = l.id
      WHERE l.id NOT IN (SELECT group_id FROM stock WHERE group_id IS NOT NULL)
        AND l.id NOT IN (
          SELECT group_id FROM occurrences
          WHERE group_id IS NOT NULL AND source_id IN (${oneShot})
        )
    `,
    args: [STOCK_BATCH, ...ONE_SHOT_SOURCES],
  });
  const observed = lifetimes.rows.map((row) => ({
    days: Number(row['days']),
    ended: Number(row['ended']) === 1,
  }));
  const curve = survivalCurve(observed);

  return {
    survival: {
      medianDays: curve.medianDays,
      completed: curve.completed,
      censored: curve.censored,
      horizonDays: Math.round(curve.horizonDays),
      // Part encore en ligne à J+1, J+3, J+7 — `null` au-delà de l'horizon —,
      // et combien d'annonces l'ont atteint : la part se lit avec son effectif.
      aliveAfter: [1, 3, 7].map((day) => ({
        day,
        share: shareAlive(curve, day),
        atRisk: observed.filter((one) => one.days >= day).length,
      })),
    },
    history: history.rows
      .map((r) => ({
        day: String(r['day']),
        matching: Number(r['matching']),
        uncertain: Number(r['uncertain']),
        rented: Number(r['rented']),
        total: Number(r['total']),
        activeSources: Number(r['active_sources']),
      }))
      .reverse(),
    listings: {
      total: Number(listings.rows[0]?.['total'] ?? 0),
      matching: Number(listings.rows[0]?.['matching'] ?? 0),
      uncertain: Number(listings.rows[0]?.['uncertain'] ?? 0),
      rented: Number(listings.rows[0]?.['rented'] ?? 0),
      active: Number(listings.rows[0]?.['active'] ?? 0),
      viewed: Number(engagement.rows[0]?.['viewed'] ?? 0),
      archived: Number(engagement.rows[0]?.['archived'] ?? 0),
    },
    byTracking: toMap(byTracking.rows as Record<string, unknown>[], 'tracking'),
    bySource: toMap(bySource.rows as Record<string, unknown>[], 'source_id'),
    contacts: {
      total: Number(contacts.rows[0]?.['total'] ?? 0),
      byOutcome: toMap(outcomes.rows as Record<string, unknown>[], 'outcome'),
    },
  };
}
