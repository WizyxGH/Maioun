/**
 * Limiter ce qu'une même origine peut demander, et à quel rythme (§26, §30).
 *
 * TROIS ROUTES SE PAIENT CHER SI ON LES LAISSE OUVERTES :
 *
 *   - L'INSCRIPTION. Sans limite, mille comptes se créent en une minute. Chacun
 *     tient une ligne en base, un jeton d'alerte, une adresse de transfert. Le
 *     palier gratuit de Turso s'épuise, et le service s'arrête pour tout le
 *     monde.
 *
 *   - LE MOT DE PASSE OUBLIÉ. C'est l'arme la plus vicieuse des trois : elle
 *     n'attaque pas le service, elle attaque QUELQU'UN. Il suffit de connaître
 *     un identifiant et de demander cent liens pour noyer sa boîte — et les
 *     messages partent de chez nous, donc c'est notre expéditeur qui finit
 *     signalé comme indésirable.
 *
 *   - LA CONNEXION. Cent mille tours de PBKDF2 par tentative : c'est le prix
 *     qui protège les mots de passe, et c'est aussi ce qui rend la route
 *     coûteuse à marteler.
 *
 * POURQUOI EN BASE ET NON EN MÉMOIRE. Un Worker n'a pas de mémoire d'une
 * requête à l'autre, et il en tourne plusieurs en parallèle, dans plusieurs
 * régions : un compteur en variable ne compterait rien. Le stockage clé-valeur
 * conviendrait mieux techniquement, mais son palier gratuit plafonne à mille
 * ÉCRITURES par jour — un limiteur en écrit une par tentative, il tomberait
 * donc en panne exactement quand on l'attaque. Turso compte en millions.
 *
 * LA FENÊTRE EST FIXE, pas glissante. Une fenêtre glissante demanderait de
 * garder chaque tentative ; celle-ci ne garde qu'un compteur et sa date de
 * départ, et repart à zéro quand la fenêtre est révolue. À la charnière, on
 * peut donc consommer deux fois le quota en un instant. C'est connu, c'est
 * accepté : on protège d'un déluge, pas d'un adversaire méthodique.
 *
 * ON NE CONSERVE JAMAIS L'IP EN CLAIR. Une adresse IP est une donnée
 * personnelle ; seule son empreinte entre en base, et seulement le temps de la
 * fenêtre.
 */

import type { Client } from '@libsql/client/web';

export interface RateLimit {
  /** Nombre de tentatives autorisées par fenêtre. */
  readonly limit: number;
  /** Durée de la fenêtre, en millisecondes. */
  readonly windowMs: number;
}

/** Une heure, la fenêtre de référence. */
const HOUR = 3_600_000;

/**
 * Les quotas, réunis ici pour qu'on les lise d'un coup d'œil.
 *
 * LES CHIFFRES SONT GÉNÉREUX POUR UN HUMAIN, étroits pour un script. Trois
 * inscriptions par heure depuis une même adresse : personne n'en crée quatre de
 * bonne foi. Cinq demandes de réinitialisation : de quoi se tromper plusieurs
 * fois sans jamais être bloqué. Dix connexions ratées : on retrouve son mot de
 * passe bien avant.
 */
export const LIMITS = {
  signup: { limit: 3, windowMs: HOUR },
  forgot: { limit: 5, windowMs: HOUR },
  login: { limit: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimit>;

/**
 * L'empreinte de ce qu'on limite — presque toujours une adresse IP.
 *
 * Tronquée à seize caractères hexadécimaux : c'est assez pour qu'une collision
 * soit improbable à cette échelle, et assez court pour que la table reste
 * légère. Le sel est le nom du seau, ce qui empêche de recouper deux seaux pour
 * savoir que la même personne s'est inscrite et a demandé un lien.
 */
export async function fingerprint(kind: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${kind}:${value}`),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * L'origine d'une requête, telle que Cloudflare la connaît.
 *
 * `CF-Connecting-IP` est posé par la plateforme elle-même et ne peut pas être
 * usurpé par le client — contrairement à `X-Forwarded-For`, que n'importe qui
 * envoie ce qu'il veut dedans. En son absence (tests, exécution locale), on
 * rend une chaîne fixe : tout le monde partage alors le même seau, ce qui est
 * le comportement prudent.
 */
export function callerKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'inconnu';
}

/**
 * Consomme une tentative. `true` si elle est autorisée.
 *
 * EN CAS D'ERREUR DE BASE, ON LAISSE PASSER. Un limiteur en panne ne doit pas
 * fermer le service : refuser toutes les inscriptions parce qu'une requête a
 * échoué serait s'infliger soi-même la panne dont on se protège. Le risque
 * inverse — laisser passer un déluge pendant une panne Turso — est le moindre
 * des deux, et de toute façon le service entier dépend de cette base.
 */
export async function allow(
  db: Client,
  bucket: string,
  { limit, windowMs }: RateLimit,
  nowMs: number,
): Promise<boolean> {
  const startsAt = new Date(nowMs - windowMs).toISOString();
  const now = new Date(nowMs).toISOString();

  try {
    const found = await db.execute({
      sql: 'SELECT count, window_start FROM rate_limits WHERE bucket = ? LIMIT 1',
      args: [bucket],
    });
    const row = found.rows[0];
    const windowStart = typeof row?.['window_start'] === 'string' ? row['window_start'] : null;
    const fresh = windowStart === null || windowStart <= startsAt;

    if (fresh) {
      // Nouvelle fenêtre : on écrase, sans jamais accumuler d'historique.
      await db.execute({
        sql: `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?)
              ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = excluded.window_start`,
        args: [bucket, now],
      });
      return true;
    }

    const count = Number(row?.['count'] ?? 0);
    if (count >= limit) return false;

    await db.execute({
      sql: 'UPDATE rate_limits SET count = count + 1 WHERE bucket = ?',
      args: [bucket],
    });
    return true;
  } catch {
    return true;
  }
}

/**
 * Le seau d'une requête, prêt à passer à `allow`.
 *
 * Le nom du seau porte le TYPE d'action : une inscription et une demande de
 * réinitialisation venues de la même adresse ne se gênent pas l'une l'autre.
 */
export async function bucketFor(kind: keyof typeof LIMITS, value: string): Promise<string> {
  return `${kind}:${await fingerprint(kind, value)}`;
}
