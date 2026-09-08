/**
 * Commande `pnpm contact:bep` — demander les coordonnées des biens MIS EN
 * FAVORI sur le bulletin abonné (§23, §24).
 *
 * C'EST LA SEULE COMMANDE DU PROJET QUI ÉCRIT À UN TIERS. Tout le reste
 * dépose des brouillons, ouvre des liens, compose des messages : l'utilisateur
 * appuie. Ici, une demande part en son nom vers une agence, sur un abonnement
 * qu'il paie et dont l'accès peut lui être retiré. Il l'a demandé
 * explicitement ; le code doit donc être plus prudent que d'habitude, pas
 * moins.
 *
 * TROIS VERROUS, ET IL EN FAUT TROIS :
 *
 *   1. `AUTO_CONTACT_ENABLED` — l'interrupteur du §23, absent = éteint ;
 *   2. `--envoyer` — sans ce mot, la commande DIT ce qu'elle ferait et sort.
 *      Un essai à blanc est le comportement par défaut d'un outil qui ne se
 *      rattrape pas ;
 *   3. une annonce déjà demandée est écartée par `contact_attempts`, et trois
 *      secondes séparent deux envois — on ne mitraille pas un partenaire (§10).
 *
 * CE QUE CETTE COMMANDE N'EMPLOIE PAS, et il faut le dire : les seuils de score
 * de `contact/guards.ts`. Ils filtrent des annonces choisies par une RÈGLE ;
 * ici l'utilisateur a désigné les siennes une par une, et lui refuser un favori
 * parce que son score d'opportunité est bas reviendrait à lui expliquer ce
 * qu'il veut. Les quotas glissants de ce module n'ont pas davantage de prise :
 * le nombre de favoris borne déjà l'envoi, et rien ne part sans `--envoyer`.
 *
 * LES FAVORIS SEULEMENT, et c'est délibéré. Un critère est une règle écrite
 * une fois ; un favori est un choix fait devant l'annonce. Pour une action
 * irréversible au nom de quelqu'un, on s'en tient à ce qu'il a désigné.
 *
 * Usage :
 *   node --env-file=.env dist/cli/contact-bep.js            (essai à blanc)
 *   node --env-file=.env dist/cli/contact-bep.js --envoyer
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { CURRENT_USER } from '@rentfinder/shared';
import { openDatabaseFromEnv } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { createLogger } from '../core/logger.js';
import { collectorUserAgent, loadBepCredentials, loadDotEnv } from '../config.js';
import { bulletinRefFrom, sendBepRequest } from '../contact/bep-request.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../../../database/migrations');

/** Une seconde entre deux envois : on ne mitraille pas un partenaire (§10). */
const PAUSE_MS = 3_000;

const pause = async (ms: number): Promise<void> =>
  await new Promise((done) => setTimeout(done, ms));

async function main(): Promise<void> {
  loadDotEnv();
  const logger = createLogger({ minLevel: 'info' });
  const envoyer = process.argv.includes('--envoyer');

  if ((process.env['AUTO_CONTACT_ENABLED'] ?? '').toLowerCase() !== 'true') {
    console.log('⛔ AUTO_CONTACT_ENABLED n’est pas à « true » — rien ne partira (§23).');
    return;
  }

  const credentials = loadBepCredentials();
  if (credentials === null) {
    console.log('⚠️  Aucun accès abonné BEP configuré. Rien à faire.');
    return;
  }

  const db = openDatabaseFromEnv();
  try {
    await migrate(db, MIGRATIONS_DIR, logger);

    /**
     * LES FAVORIS ENCORE VIVANTS, jamais contactés, dont le bulletin porte
     * encore un bouton de demande. Une annonce déjà demandée n'en a plus : son
     * lien pointe l'accueil, `bulletinRefFrom` rend `null`, et elle est écartée
     * plus bas sans qu'on ait à tenir un second registre.
     */
    const result = await db.execute({
      sql: `SELECT l.id, l.title, json_extract(l.payload, '$.contact.formUrl') AS form_url
            FROM listing_user_state s
            JOIN listings l ON l.id = s.listing_id
            WHERE s.user_id = ? AND s.favorite = 1
              AND l.lifecycle != 'inactive' AND l.rented = 0
              AND l.id LIKE 'bep-abonnes:%'
              AND NOT EXISTS (
                SELECT 1 FROM contact_attempts c
                WHERE c.listing_id = l.id AND c.user_id = ?
              )
            ORDER BY l.action_priority DESC`,
      args: [CURRENT_USER, CURRENT_USER],
    });

    const candidates = result.rows
      .map((row) => ({
        id: String(row['id']),
        title: String(row['title'] ?? ''),
        bulletinRef: bulletinRefFrom(typeof row['form_url'] === 'string' ? row['form_url'] : null),
      }))
      .filter(
        (one): one is { id: string; title: string; bulletinRef: string } =>
          // Sans identifiant de bulletin, il n'y a rien à demander — la demande a
          // déjà été faite, ou le bouton n'existe pas (§17).
          one.bulletinRef !== null,
      );

    console.log(`📋 ${candidates.length} favori(s) BEP à demander.`);
    for (const one of candidates) {
      console.log(`   • ${one.title.slice(0, 60)} (bulletin ${one.bulletinRef})`);
    }
    if (candidates.length === 0) return;

    if (!envoyer) {
      console.log('\n🅿️  Essai à blanc : rien n’est parti.');
      console.log('   Relancez avec « --envoyer » pour envoyer réellement.');
      return;
    }

    const userAgent = collectorUserAgent();
    let sent = 0;
    for (const [index, one] of candidates.entries()) {
      if (index > 0) await pause(PAUSE_MS);
      const outcome = await sendBepRequest(one.bulletinRef, { credentials, userAgent });

      if (!outcome.ok) {
        console.log(`   ✗ ${one.id} — ${outcome.reason}`);
        logger.warn('bep.request_failed', { listingId: one.id, reason: outcome.reason });
        continue;
      }

      // ON N'ENREGISTRE QU'APRÈS UN ENVOI CONFIRMÉ. Écrire d'abord ferait
      // passer pour contactée une annonce qui ne l'est pas, et l'écarterait de
      // tous les essais suivants.
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO contact_attempts
                (id, listing_id, user_id, source_id, channel, trigger, sent_at, message,
                 follow_up_index, outcome, documents, updated_at)
              VALUES (?,?,?,?,'form','auto',?,'',0,'pending','[]',?)`,
        args: [randomUUID(), one.id, CURRENT_USER, 'bep-abonnes', now, now],
      });
      await db.execute({
        sql: 'UPDATE listings SET tracking = ?, updated_at = ? WHERE id = ?',
        args: ['contacted', now, one.id],
      });
      sent += 1;
      console.log(`   ✓ ${one.title.slice(0, 60)}`);
    }

    console.log(`\n📨 ${sent} demande(s) envoyée(s). BEP vous répondra par ses moyens habituels.`);
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error('Échec :', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
