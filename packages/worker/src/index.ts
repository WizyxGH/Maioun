/**
 * Worker Cloudflare : l'API du site publié, et le seul endroit qui connaisse
 * le jeton Turso (§26, §28).
 *
 * CE QU'IL CHANGE. Le site publié interrogeait Turso DIRECTEMENT : le jeton
 * vivait dans le navigateur, il ouvrait toute la base, et aucun mot de passe
 * ne pouvait donc être vérifié — un écran de connexion posé devant se serait
 * contourné en changeant une variable. Ici le jeton est un secret de la
 * plateforme ; le navigateur ne reçoit qu'un cookie de session signé.
 *
 * IL N'INVENTE PAS D'API. Les routes existent déjà (`routes.ts` du collecteur),
 * écrites pour deux transports dès l'origine : le serveur local et celui-ci.
 * Elles ne dépendent que des standards Web et de l'interface `Client` de
 * libsql. Ce fichier n'ajoute que ce qui lui est propre — l'authentification,
 * et le fait de savoir QUI demande.
 *
 * CE QU'IL NE SERT PAS : les filtres éditables et les pièces du dossier
 * touchent le disque de la machine. `routes.ts` répond 501 pour elles quand le
 * transport ne les fournit pas, ce qui est le cas ici.
 */

import { createClient, type Client } from '@libsql/client/web';
import { route } from '@rentfinder/collector/server/routes';
import { clearedCookie, issueSession, readCookie, readSession, sessionCookie } from './auth.js';
import { deleteDocument, listDocuments, readDocument, saveDocument } from './documents.js';
import { kvDocumentStore, type KeyValueNamespace } from './kv-store.js';
import { forbiddenOrigin } from './origin.js';
import { alertAddress } from './alert-address.js';
import { mailerConfigured, sendEmail } from '@rentfinder/collector/notify/mailer';
import { relayPhoto } from './photo-relay.js';
import { triggerCollect } from './collect-trigger.js';
import { completeReset, openReset, resetEmailBody, resetLink } from './password-reset.js';
import {
  changeEmail,
  changeEmailProblemMessage,
  confirmEmail,
  confirmEmailBody,
  confirmLink,
  createAccount,
  deleteAccount,
  signupProblemMessage,
} from './signup.js';
import { allow, bucketFor, callerKey, LIMITS } from './rate-limit.js';

export interface Env {
  /** URL `libsql://…` de la base. Secret de la plateforme, jamais publié. */
  readonly TURSO_DATABASE_URL: string;
  readonly TURSO_AUTH_TOKEN: string;
  /** Clé de signature des sessions. La changer déconnecte tout le monde. */
  readonly SESSION_SECRET: string;
  /** Origine autorisée à appeler l'API (le site). */
  readonly ALLOWED_ORIGIN?: string;
  /**
   * Espace des pièces du dossier (§25), dans le stockage clé-valeur des
   * Workers. Absent = la fonctionnalité répond 501 et le dit, plutôt que
   * d'accepter des fichiers pour les perdre.
   *
   * KV et non R2 : R2 réclame une carte bancaire avant de créer le moindre
   * seau, KV est compris dans le plan gratuit (voir `kv-store.ts`).
   */
  readonly DOCUMENTS?: KVNamespace;
  /**
   * Gabarit de l'adresse de transfert des alertes (§6), avec `{token}` à la
   * place du jeton du compte — par exemple `alertes+{token}@exemple.fr`.
   *
   * Absent : l'écran n'affiche rien plutôt qu'une adresse inventée (§17). Une
   * adresse fausse serait pire que pas d'adresse du tout : l'utilisateur
   * poserait une règle de transfert vers le vide et attendrait des alertes qui
   * ne viendraient jamais.
   */
  readonly ALERT_ADDRESS_TEMPLATE?: string;
  /**
   * Adresse publique du site, pour composer le lien de réinitialisation.
   * Absente, la réinitialisation est refusée : un lien sans domaine ne mène
   * nulle part, et l'annoncer envoyé serait mentir (§17).
   */
  readonly SITE_URL?: string;
  /** Clé d'API du service d'envoi d'e-mails. Absente = pas de réinitialisation. */
  readonly EMAIL_API_KEY?: string;
  /** Expéditeur des messages, ex. `Maïoun <compte@example.invalid>`. */
  readonly EMAIL_FROM?: string;
  /**
   * Jeton GitHub qui permet au réveil planifié de demander une collecte.
   *
   * Portée MINIMALE : `actions: write` sur ce seul dépôt. Le Worker n'a besoin
   * que d'appuyer sur un bouton ; un jeton classique lui donnerait le dépôt
   * entier. Absent, le réveil se tait et le dit plutôt que de laisser croire
   * que la collecte repart (§17).
   */
  readonly GITHUB_DISPATCH_TOKEN?: string;
  /** `proprietaire/depot`. Absent : le dépôt du projet. */
  readonly GITHUB_REPOSITORY?: string;
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  // On ne renvoie l'origine que si elle est CELLE QU'ON ATTEND. Un `*` avec
  // des cookies est refusé par les navigateurs, et le serait à raison : il
  // laisserait n'importe quel site appeler l'API avec votre session.
  const allowed = env.ALLOWED_ORIGIN ?? '';
  const same = origin !== null && origin === allowed;
  return {
    'Access-Control-Allow-Origin': same ? origin : allowed,
    'Access-Control-Allow-Credentials': 'true',
    // PUT MANQUAIT, et c'est le genre d'oubli qui ne se voit qu'à l'usage :
    // le navigateur REFUSE la requête avant de l'envoyer, si bien que l'écran
    // annonce un échec pour un appel que le serveur n'a jamais reçu. Les
    // critères de recherche et les réglages de compte s'enregistrent en PUT :
    // aucun des deux ne fonctionnait.
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

/**
 * Garantit les en-têtes CORS sur une réponse, quelle qu'en soit l'origine.
 *
 * Une réponse d'erreur sans `Access-Control-Allow-Origin` est refusée par le
 * navigateur AVANT d'atteindre le code : le `fetch` échoue, et le statut HTTP
 * est perdu. Un « 401 session expirée » devient alors indiscernable d'une
 * coupure réseau, et l'écran ne peut plus renvoyer vers la connexion.
 */
function withCors(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

/**
 * Connexion.
 *
 * LE MÊME MESSAGE POUR UN IDENTIFIANT INCONNU ET UN MAUVAIS MOT DE PASSE.
 * Distinguer les deux dirait à un inconnu quels comptes existent.
 *
 * Et l'empreinte est vérifiée MÊME QUAND L'IDENTIFIANT N'EXISTE PAS, contre
 * une empreinte factice : sans cela, une réponse instantanée trahirait un
 * compte inexistant, et une réponse lente un compte réel.
 */
async function login(db: Client, request: Request, env: Env, cors: Record<string, string>) {
  const { verifyPassword } = await import('./auth.js');
  let body: { login?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Requête illisible' }, cors, 400);
  }
  const identifiant = typeof body.login === 'string' ? body.login.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (identifiant === '' || password === '') {
    return json({ error: 'Identifiant et mot de passe requis' }, cors, 400);
  }

  const found = await db.execute({
    sql: 'SELECT id, password_hash FROM users WHERE login = ?',
    args: [identifiant],
  });
  const row = found.rows[0];
  const stored = typeof row?.['password_hash'] === 'string' ? row['password_hash'] : DUMMY_HASH;
  const ok = await verifyPassword(password, stored);
  if (!ok || row === undefined) {
    return json({ error: 'Identifiant ou mot de passe incorrect' }, cors, 401);
  }

  const userId = String(row['id']);
  const token = await issueSession(userId, env.SESSION_SECRET, Date.now());
  return new Response(JSON.stringify({ userId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': sessionCookie(token),
      ...cors,
    },
  });
}

/**
 * Empreinte factice, sur laquelle on vérifie quand l'identifiant n'existe pas.
 * Son mot de passe est inconnu et sans intérêt : seul son COÛT compte.
 */
const DUMMY_HASH =
  'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Les pièces du dossier (§25).
 *
 * Elles vivent dans R2, préfixées par le compte : un dossier de candidature
 * contient une fiche de paie et une pièce d'identité, il n'y a pas de pièces
 * communes.
 *
 * RIEN N'EST ENVOYÉ AUTOMATIQUEMENT (§24) : on stocke, on liste, on rend, on
 * supprime. C'est vous qui joignez.
 */
async function documents(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  userId: string,
  name: string | undefined,
): Promise<Response> {
  const namespace = env.DOCUMENTS;
  if (namespace === undefined) {
    return json({ error: 'Aucun espace de fichiers configuré.' }, cors, 501);
  }
  // L'adaptateur est construit ICI, et c'est le seul endroit où le type réel
  // de Cloudflare rencontre notre interface : TypeScript y vérifie que les
  // deux coïncident encore.
  const store = kvDocumentStore(namespace as unknown as KeyValueNamespace);

  if (request.method === 'GET' && name === undefined) {
    return json({ documents: await listDocuments(store, userId) }, cors);
  }
  if (request.method === 'GET' && name !== undefined) {
    const found = await readDocument(store, userId, decodeURIComponent(name));
    if (found === null) return json({ error: 'Pièce introuvable' }, cors, 404);
    for (const [key, value] of Object.entries(cors)) found.headers.set(key, value);
    return found;
  }
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return json({ error: 'Aucun fichier reçu' }, cors, 400);
    const result = await saveDocument(store, userId, file.name, await file.arrayBuffer());
    return result.ok ? json(result.document, cors, 201) : json({ error: result.error }, cors, 400);
  }
  if (request.method === 'DELETE' && name !== undefined) {
    const done = await deleteDocument(store, userId, decodeURIComponent(name));
    return done
      ? new Response(null, { status: 204, headers: cors })
      : json({ error: 'Nom refusé' }, cors, 400);
  }
  return json({ error: 'Route inconnue' }, cors, 404);
}

/**
 * Les deux temps d'une réinitialisation : demander un lien, puis s'en servir.
 *
 * LA DEMANDE RÉPOND TOUJOURS PAREIL — 204, quoi qu'il arrive. Distinguer
 * « compte inconnu » de « message envoyé » ferait de ce formulaire un annuaire
 * de comptes, interrogeable en boucle. Le seul cas où l'on répond autre chose
 * est l'ABSENCE DE CONFIGURATION : là, aucun message ne partira jamais, pour
 * personne, et le taire laisserait l'utilisateur rafraîchir sa boîte en vain.
 */
async function passwordRoute(
  db: Client,
  request: Request,
  env: Env,
  cors: Record<string, string>,
  action: string | undefined,
): Promise<Response> {
  const siteUrl = env.SITE_URL ?? '';

  if (action === 'forgot') {
    if (!mailerConfigured(env) || siteUrl === '') {
      return json({ error: 'unconfigured' }, cors, 501);
    }
    // LA PLUS VICIEUSE DES TROIS ROUTES : elle n'attaque pas le service, elle
    // attaque QUELQU'UN. Connaître un identifiant suffirait à noyer la boîte de
    // son propriétaire — et les messages partant de chez nous, c'est notre
    // expéditeur qui finirait signalé comme indésirable.
    const bucket = await bucketFor('forgot', callerKey(request));
    if (!(await allow(db, bucket, LIMITS.forgot, Date.now()))) {
      // 204 comme toujours : dire « trop de demandes » apprendrait déjà
      // quelque chose. Le silence est la même réponse que d'habitude.
      return new Response(null, { status: 204, headers: cors });
    }
    const body = (await request.json().catch(() => ({}))) as { login?: unknown };
    const login = typeof body.login === 'string' ? body.login : '';
    if (login.trim() !== '') {
      const pending = await openReset(db, login, Date.now());
      if (pending !== null) {
        await sendEmail(env, {
          to: pending.email,
          subject: 'Réinitialiser votre mot de passe Maïoun',
          text: resetEmailBody(resetLink(siteUrl, pending.token)),
        });
      }
    }
    return new Response(null, { status: 204, headers: cors });
  }

  if (action === 'reset') {
    const body = (await request.json().catch(() => ({}))) as {
      token?: unknown;
      password?: unknown;
    };
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (token === '') return json({ error: 'invalid' }, cors, 400);

    const outcome = await completeReset(db, token, password, Date.now());
    if (outcome === 'ok') return new Response(null, { status: 204, headers: cors });
    return json({ error: outcome }, cors, 400);
  }

  return json({ error: 'Route inconnue' }, cors, 404);
}

/**
 * Inscription (§26).
 *
 * TROIS BARRIÈRES, ET AUCUNE N'EST DE TROP :
 *
 *   1. LE DÉBIT. Trois inscriptions par heure et par origine. Sans cela, un
 *      script en crée mille en une minute et épuise le palier gratuit de la
 *      base — le service s'arrête alors pour tout le monde, ce qui est
 *      exactement le but recherché par qui s'y essaie.
 *
 *   2. L'ADRESSE. Forme réelle, domaine qui existe, pas de boîte jetable — un
 *      compte adossé à une adresse de dix minutes n'a pas de propriétaire.
 *
 *   3. LA CONFIRMATION. La seule preuve qui vaille. Le compte est utilisable
 *      tout de suite, mais son adresse ne sert à rien tant qu'elle n'est pas
 *      confirmée : la réinitialisation de mot de passe la refuse.
 *
 * ON CONNECTE IMMÉDIATEMENT. Renvoyer vers l'écran de connexion après une
 * inscription réussie fait retaper ce qu'on vient de saisir, sans rien
 * protéger : on vient de prouver qu'on connaît ce mot de passe.
 */
async function signup(
  db: Client,
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const bucket = await bucketFor('signup', callerKey(request));
  if (!(await allow(db, bucket, LIMITS.signup, Date.now()))) {
    return json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, cors, 429);
  }

  const body = (await request.json().catch(() => ({}))) as {
    login?: unknown;
    email?: unknown;
    password?: unknown;
  };
  const login = typeof body.login === 'string' ? body.login : '';
  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const created = await createAccount(db, { login, email, password }, Date.now());
  if (!created.ok) return json({ error: signupProblemMessage(created.problem) }, cors, 400);

  // LE MESSAGE EST SECONDAIRE, le compte existe déjà. Un envoi impossible —
  // pas encore configuré, fournisseur en panne — ne doit pas transformer une
  // inscription réussie en échec : l'adresse restera simplement à confirmer.
  const siteUrl = env.SITE_URL ?? '';
  let confirmationSent = false;
  if (mailerConfigured(env) && siteUrl !== '') {
    confirmationSent = await sendEmail(env, {
      to: created.account.email,
      subject: 'Confirmez votre adresse Maïoun',
      text: confirmEmailBody(confirmLink(siteUrl, created.account.token)),
    });
  }

  const token = await issueSession(created.account.userId, env.SESSION_SECRET, Date.now());
  return new Response(JSON.stringify({ userId: created.account.userId, confirmationSent }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': sessionCookie(token),
      ...cors,
    },
  });
}

/**
 * Suppression du compte (RGPD, article 17 — « droit à l'effacement »).
 *
 * LE MOT DE PASSE EST REDEMANDÉ, alors qu'on est déjà connecté. Ce n'est pas
 * une formalité : un ordinateur laissé ouvert, un lien piégé, et un compte
 * entier disparaît sans retour. Redemander le mot de passe est la seule chose
 * qui distingue le propriétaire de quiconque a la main sur son écran.
 *
 * ELLE EST IMMÉDIATE ET SANS RETOUR. Pas de corbeille, pas de délai de grâce :
 * effacer veut dire effacer. Ce que l'écran doit dire clairement AVANT, parce
 * qu'après il n'y a plus personne à qui le dire.
 */
/**
 * L'adresse du compte : la lire, ou en changer. `null` si la méthode ne
 * correspond à rien ici — l'appelant poursuit alors son aiguillage.
 *
 * Route À PART et non un champ de `/api/me` : `me` répond à chaque ouverture du
 * site sans toucher la base, et y ajouter une lecture de ligne la ferait payer
 * à tout le monde pour un écran de réglages qu'on ouvre une fois (§30).
 */
async function accountEmailRoute(
  db: Client,
  request: Request,
  env: Env,
  cors: Record<string, string>,
  userId: string,
): Promise<Response | null> {
  if (request.method === 'POST') return changeEmailRoute(db, request, env, cors, userId);
  if (request.method !== 'GET') return null;

  const row = await db.execute({
    sql: 'SELECT email, email_verified FROM users WHERE id = ? LIMIT 1',
    args: [userId],
  });
  const found = row.rows[0];
  const address = found?.['email'];
  return json(
    {
      email: typeof address === 'string' && address !== '' ? address : null,
      verified: Number(found?.['email_verified'] ?? 0) === 1,
    },
    cors,
  );
}

/**
 * Change l'adresse du compte et envoie le lien qui la prouve.
 *
 * `confirmationSent` DIT LA VÉRITÉ. L'adresse est écrite dans tous les cas,
 * mais elle reste NON prouvée tant que le lien n'est pas suivi — et sans envoi
 * configuré, ce lien ne partira jamais. L'écran doit pouvoir le dire, faute de
 * quoi l'utilisateur attendrait un message qui n'existe pas (§17).
 */
async function changeEmailRoute(
  db: Client,
  request: Request,
  env: Env,
  cors: Record<string, string>,
  userId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const changed = await changeEmail(db, userId, { email, password }, Date.now());
  if (!changed.ok) {
    const status = changed.problem === 'wrong-password' ? 401 : 400;
    return json({ error: changeEmailProblemMessage(changed.problem) }, cors, status);
  }

  const siteUrl = env.SITE_URL ?? '';
  let confirmationSent = false;
  if (mailerConfigured(env) && siteUrl !== '') {
    confirmationSent = await sendEmail(env, {
      to: changed.email,
      subject: 'Confirmez votre nouvelle adresse Maïoun',
      text: confirmEmailBody(confirmLink(siteUrl, changed.token)),
    });
  }

  return json({ email: changed.email, confirmationSent }, cors);
}

async function deleteAccountRoute(
  db: Client,
  request: Request,
  env: Env,
  cors: Record<string, string>,
  userId: string,
): Promise<Response> {
  const { verifyPassword } = await import('./auth.js');
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === 'string' ? body.password : '';

  const found = await db.execute({
    sql: 'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
    args: [userId],
  });
  const stored = found.rows[0]?.['password_hash'];
  if (typeof stored !== 'string' || !(await verifyPassword(password, stored))) {
    return json({ error: 'Mot de passe incorrect.' }, cors, 401);
  }

  // Les pièces du dossier vivent dans le stockage clé-valeur, hors de la base :
  // les oublier laisserait des fiches de paie et des pièces d'identité derrière
  // un compte supprimé — précisément ce que l'article 17 interdit.
  const namespace = env.DOCUMENTS;
  if (namespace !== undefined) {
    const store = kvDocumentStore(namespace as unknown as KeyValueNamespace);
    for (const document of await listDocuments(store, userId)) {
      await deleteDocument(store, userId, document.name);
    }
  }

  await deleteAccount(db, userId);
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearedCookie(), ...cors },
  });
}

/**
 * Les routes qui n'exigent AUCUNE session, réunies.
 *
 * Elles étaient en ligne dans `fetch`, qui a fini par dépasser le seuil de
 * complexité toléré : sept branches avant même de savoir qui demande. Les
 * réunir dit aussi quelque chose d'utile — voici la surface joignable sans
 * compte, et il n'y en a pas d'autre.
 *
 * @returns la réponse, ou `null` si la requête ne relève d'aucune de ces routes.
 */
async function publicRoute(
  db: Client,
  request: Request,
  env: Env,
  cors: Record<string, string>,
  segments: readonly string[],
): Promise<Response | null> {
  /**
   * LES PHOTOS EN CLAIR, RELAYÉES EN HTTPS. Publique à dessein : une balise
   * `<img>` vers un autre domaine n'envoie pas le cookie de session, donc
   * exiger une session rendrait la route inutilisable par le navigateur. Ce
   * n'est pas une fuite — voir `photo-relay.ts`, dont la liste blanche de deux
   * hôtes est la seule ligne de défense.
   */
  if (segments[1] === 'photo' && request.method === 'GET') {
    return relayPhoto(
      new URL(request.url).searchParams.get('url'),
      // On annonce qui l'on est, toujours (§10) — même en allant chercher une
      // image.
      'RentFinderBot/0.1 (+https://github.com/WizyxGH/RentFinder)',
      cors,
    );
  }

  if (segments[1] === 'login' && request.method === 'POST') {
    // CENT MILLE TOURS DE PBKDF2 PAR TENTATIVE : c'est ce qui protège les
    // mots de passe, et c'est aussi ce qui rend cette route coûteuse à
    // marteler. Dix essais ratés par heure laissent largement de quoi se
    // tromper, et ne laissent rien pour deviner.
    const bucket = await bucketFor('login', callerKey(request));
    if (!(await allow(db, bucket, LIMITS.login, Date.now()))) {
      return json({ error: 'Trop de tentatives. Réessayez dans une heure.' }, cors, 429);
    }
    return login(db, request, env, cors);
  }
  if (segments[1] === 'signup' && request.method === 'POST' && segments[2] === undefined) {
    return signup(db, request, env, cors);
  }
  // La confirmation d'adresse : avant la lecture de session, car on peut
  // suivre le lien depuis un autre appareil que celui de l'inscription.
  if (segments[1] === 'signup' && segments[2] === 'confirm' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token : '';
    if (token === '') return json({ error: 'invalid' }, cors, 400);
    const outcome = await confirmEmail(db, token, Date.now());
    return outcome === 'ok'
      ? new Response(null, { status: 204, headers: cors })
      : json({ error: 'invalid' }, cors, 400);
  }
  if (segments[1] === 'logout') {
    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': clearedCookie(), ...cors },
    });
  }

  // MOT DE PASSE OUBLIÉ. Avant la lecture de session, forcément : celui qui
  // l'a oublié n'en a pas.
  if (segments[1] === 'password' && request.method === 'POST') {
    return passwordRoute(db, request, env, cors, segments[2]);
  }
  return null;
}

export default {
  /**
   * LE RÉVEIL DE LA COLLECTE (§30).
   *
   * Le `schedule` de GitHub n'exécutait plus que trois passages par jour sur
   * quarante-huit demandés : il met les réveils planifiés en file et les écarte
   * sans le dire. Les Cron Triggers de Cloudflare, eux, tiennent l'heure. Ce
   * Worker ne collecte pas — il n'en a ni le temps ni les moyens — il demande à
   * GitHub d'exécuter le workflow, ce qui compte comme un déclenchement manuel
   * et échappe donc à la file des `schedule`.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const result = await triggerCollect(env);
    // Le journal du Worker est le seul endroit où cela se lit : `wrangler tail`
    // pour le suivre en direct.
    console.log(
      result.triggered ? 'collecte demandée à GitHub' : `collecte NON demandée : ${result.reason}`,
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Avant toute lecture de session : une requête d'écriture venue d'ailleurs
    // ne doit pas même atteindre la base.
    if (forbiddenOrigin(request, env)) {
      return json({ error: 'Origine refusée' }, cors, 403);
    }

    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter((part) => part !== '');

    const db = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });

    // LES ROUTES OUVERTES D'ABORD, toutes ensemble : elles s'adressent à qui
    // n'a pas — ou pas encore — de session.
    const open = await publicRoute(db, request, env, cors, segments);
    if (open !== null) return open;

    const userId = await readSession(
      readCookie(request.headers.get('Cookie')),
      env.SESSION_SECRET,
      Date.now(),
    );

    // « Qui suis-je ? » — la page s'en sert pour savoir s'il faut afficher
    // l'écran de connexion. Elle répond aussi bien à un inconnu (200 avec
    // `user: null`) qu'à une session valide : ce n'est pas une erreur de ne
    // pas être connecté.
    if (segments[1] === 'me') return json({ user: userId }, cors);

    if (userId === null) return json({ error: 'Connexion requise' }, cors, 401);

    // L'adresse de transfert des alertes (§6). Route À PART, et non un champ de
    // `/api/me` : `me` répond à chaque ouverture du site sans toucher la base,
    // et y ajouter une lecture de ligne la ferait payer à tout le monde pour un
    // écran de réglages qu'on ouvre une fois (§30).
    if (segments[1] === 'alert-address') {
      if (request.method === 'GET') {
        const row = await db.execute({
          sql: `SELECT alert_token, alert_last_received_at, alert_received_count
                FROM users WHERE id = ? LIMIT 1`,
          args: [userId],
        });
        const found = row.rows[0];
        return json(
          {
            address: alertAddress(env.ALERT_ADDRESS_TEMPLATE, found?.['alert_token']),
            // CE QUE LE TRANSFERT A RÉELLEMENT APPORTÉ. Sans ces deux chiffres,
            // une règle mal filtrée est indiscernable d'une journée calme :
            // l'une comme l'autre ne produisent rien (§17).
            lastReceivedAt: found?.['alert_last_received_at'] ?? null,
            receivedCount: Number(found?.['alert_received_count'] ?? 0),
          },
          cors,
        );
      }

      // CHANGER D'ADRESSE. L'écran prévient qu'il ne faut pas la publier — sans
      // quoi n'importe qui peut y déverser ce qu'il veut — mais une adresse
      // qu'on ne peut pas changer rend cet avertissement inutile le jour où
      // elle fuite. Le nouveau jeton est tiré ICI : la base ne saurait pas le
      // faire à chaque compte sans risquer de rejouer l'unicité.
      if (request.method === 'POST' && segments[2] === 'rotate') {
        const rotated = await db.execute({
          // Neuf octets, comme à l'inscription et comme en migration : c'est la
          // longueur qui rend l'adresse indevinable tout en restant recopiable
          // à la main. Les compteurs repartent à zéro AVEC le jeton — ils
          // décrivaient l'ancienne adresse, et les laisser ferait croire que la
          // nouvelle a déjà servi.
          sql: `UPDATE users
                SET alert_token = lower(hex(randomblob(9))),
                    alert_last_received_at = NULL,
                    alert_received_count = 0
                WHERE id = ?
                RETURNING alert_token`,
          args: [userId],
        });
        return json(
          {
            address: alertAddress(env.ALERT_ADDRESS_TEMPLATE, rotated.rows[0]?.['alert_token']),
            lastReceivedAt: null,
            receivedCount: 0,
          },
          cors,
        );
      }
    }

    if (segments[1] === 'account' && request.method === 'DELETE') {
      return deleteAccountRoute(db, request, env, cors, userId);
    }

    // L'adresse du compte — jusqu'ici posée à l'inscription et jamais
    // modifiable. Un compte dont l'adresse était fautive ou abandonnée y
    // restait pour toujours : plus de « mot de passe oublié », plus d'alertes.
    if (segments[1] === 'account' && segments[2] === 'email') {
      const answered = await accountEmailRoute(db, request, env, cors, userId);
      if (answered !== null) return answered;
    }

    if (segments[1] === 'documents') {
      return documents(request, env, cors, userId, segments[2]);
    }

    // L'API sait maintenant QUI demande : favoris, suivi et archivage sont
    // lus et écrits pour cet utilisateur-là, pas pour la fiche partagée.
    //
    // LE CORS EST POSÉ ICI, AU POINT DE SORTIE, et pas seulement dans chaque
    // réponse. Les erreurs construites par `routes.ts` n'en portaient aucun :
    // un navigateur BLOQUE alors la réponse, si bien qu'un 400 ou un 404
    // n'arrive jamais comme tel — il devient un échec réseau opaque, et
    // l'écran affiche « la connexion a échoué » pour une requête qui a
    // parfaitement abouti. Un seul endroit à ne pas oublier vaut mieux que
    // vingt.
    return withCors(await route(db, request, url, segments, cors, userId), cors);
  },
};
