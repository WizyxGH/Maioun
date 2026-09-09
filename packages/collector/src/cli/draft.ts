/**
 * Commande `pnpm draft` — crée des BROUILLONS Gmail pour les annonces
 * pertinentes (§22).
 *
 * Pour chaque annonce dans les critères, active, dotée d'un e-mail de contact et
 * sans brouillon déjà créé, on compose le message (profil + message fixe
 * éventuel) et on dépose un brouillon dans le dossier « Brouillons » de la boîte
 * IMAP configurée. RIEN N'EST ENVOYÉ : l'utilisateur relit et envoie lui-même.
 *
 * LE PROFIL VIENT DE LA BASE, et de nulle part ailleurs : c'est là qu'écrit
 * l'écran « Profil locataire ». Il a longtemps eu un second domicile dans des
 * variables d'environnement, et c'est un piège qui ne se voit pas — qui
 * corrigeait son téléphone ou ses revenus dans l'application obtenait des
 * brouillons portant les ANCIENNES valeurs, et ces brouillons-là partent à des
 * agences. Rien ne pouvait le signaler : le fichier était rempli, la commande
 * n'avait aucune raison de se plaindre.
 *
 * Nécessite IMAP_*. Idempotent : un brouillon n'est créé qu'une fois par
 * annonce (colonne `drafted`).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareMessage, CURRENT_USER } from '@maioun/shared';
import { resolveTenantProfile } from '../core/tenant-profile.js';
import { openDatabaseFromEnv } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { createRepository } from '../db/repository.js';
import { createLogger } from '../core/logger.js';
import { loadDotEnv, loadImapConfig } from '../config.js';
import { createGmailDrafts, locationClause, type DraftContent } from '../notify/gmail-draft.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../../../database/migrations');

async function main(): Promise<void> {
  loadDotEnv();
  const logger = createLogger({ minLevel: 'info' });

  const imap = loadImapConfig();
  if (imap === null) {
    console.log('⚠️  IMAP non configuré (IMAP_USER / IMAP_APP_PASSWORD). Rien à faire.');
    return;
  }
  const db = openDatabaseFromEnv();
  try {
    await migrate(db, MIGRATIONS_DIR, logger);
    const repository = createRepository(db);

    const { profile, storedUnreadable } = await resolveTenantProfile(repository);
    if (storedUnreadable) {
      console.log('⚠️  Profil illisible en base — impossible de composer un message.');
      return;
    }
    if (profile === null) {
      console.log(
        '⚠️  Profil locataire non renseigné. Remplissez-le dans l’application\n' +
          '   (Paramètres → Profil locataire), puis relancez.',
      );
      return;
    }

    const pending = await repository.pendingDrafts();
    console.log(`✉️  ${pending.length} annonce(s) pertinente(s) avec e-mail, sans brouillon.`);
    if (pending.length === 0) return;

    const drafts: DraftContent[] = pending.map((entry) => {
      const message = prepareMessage(entry.listing, profile);
      return {
        listingId: entry.id,
        to: entry.email,
        subject: message.subject,
        body: message.body,
        sourceUrl: entry.listing.sourceUrl,
        locationPhrase: locationClause(entry.address, entry.district, entry.listing.city.value),
      };
    });

    const created = await createGmailDrafts({
      config: imap,
      drafts,
      log: (event, fields) => logger.info(event, fields),
    });
    // Le brouillon est une décision PERSONNELLE : cet outil agit pour le
    // compte servi par défaut, et le dit.
    await repository.markDrafted(CURRENT_USER, created);

    console.log(`📝 ${created.length} brouillon(s) créé(s) dans « Brouillons » (${imap.user}).`);
    console.log('   Relis-les et envoie-les toi-même — rien n’est parti automatiquement (§22).');
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error('Échec de la création des brouillons :', error);
  process.exitCode = 1;
});
