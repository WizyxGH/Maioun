/**
 * RELAIS DE PHOTOS EN CLAIR (§11, §26).
 *
 * POURQUOI IL EXISTE. Le bulletin abonné BEP publie ses photos sur
 * `www.beptransaction.com`, un hôte qui NE FAIT PAS DE TLS — pas « mal
 * configuré » : `https://` n'y répond pas du tout. Le site, lui, est servi en
 * HTTPS par GitHub Pages, et un navigateur bloque une image `http://` sur une
 * page `https://` (contenu mixte). Ces photos ne s'affichaient donc jamais, et
 * le gestionnaire d'erreur du carrousel les masquait : rien à l'écran ne disait
 * pourquoi. Réécrire l'URL en `https://` ne peut pas marcher — il n'y a rien à
 * joindre en face. Le seul chemin est de récupérer l'image côté serveur, où le
 * HTTP est permis, et de la rendre en HTTPS.
 *
 * ═══ CE N'EST PAS UN PROXY OUVERT, ET C'EST L'ESSENTIEL ═══
 *
 * Un relais qui va chercher l'URL qu'on lui donne est une faille (SSRF) : on
 * s'en sert pour joindre des services internes, pour scanner, ou simplement
 * pour faire porter à notre infrastructure le trafic de quelqu'un d'autre. La
 * défense n'est pas un filtre sur ce qui est interdit — cette liste est
 * toujours incomplète — mais une LISTE BLANCHE de ce qui est permis : deux
 * noms d'hôtes, et rien d'autre ne passe.
 *
 * ELLE EST PUBLIQUE, à dessein. Une balise `<img>` vers un autre domaine
 * n'envoie pas le cookie de session : exiger une session rendrait la route
 * inutilisable par le navigateur. Ce n'est pas une fuite — le relais ne sert
 * que des photos d'annonces déjà publiques sur un hôte fixe, et ne révèle rien
 * de qui regarde. Il ne relaie NI l'adresse du visiteur NI ses en-têtes.
 *
 * CE QU'IL NE FAIT PAS : il ne stocke rien (§11 — on garde l'URL, jamais une
 * copie). Le cache est celui de Cloudflare, devant l'origine.
 */

/**
 * Les seuls hôtes joignables. Le bulletin abonné, et lui seul.
 *
 * Toute addition ici doit répondre à la même question : cet hôte sert-il des
 * images d'annonces, publiquement, sans que le relais devienne un moyen
 * d'atteindre autre chose ?
 */
const ALLOWED_HOSTS = new Set([
  'www.beptransaction.com',
  'beptransaction.com',
  // Le bulletin lui-même : les URL relatives du HTML s'y résolvent, et il ne
  // répond pas davantage en https (vérifié le 2026-09-04).
  'abonnes.beplogement.com',
]);

/** Ce qu'on accepte de renvoyer. Une page HTML n'est pas une photo. */
const ALLOWED_TYPES = /^image\/(jpeg|png|webp|gif)$/i;

/** Au-delà, ce n'est plus une photo d'annonce. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * `true` si l'URL est relayable — c'est-à-dire sur la liste blanche et en HTTP
 * ou HTTPS. Exportée pour être testée : c'est la seule ligne de défense.
 */
export function relayable(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  // `hostname` et non `host` : le port ne doit pas servir à contourner la
  // liste, et `URL` a déjà normalisé la casse et les formes trompeuses
  // (`user@autre-hote`, points terminaux…).
  return ALLOWED_HOSTS.has(url.hostname.replace(/\.$/, ''));
}

/**
 * Récupère une image en clair et la rend en HTTPS.
 *
 * NE PROPAGE AUCUN EN-TÊTE DU VISITEUR : la requête sortante est neuve, avec le
 * seul User-Agent du projet. Sans cela, on transmettrait des cookies ou un
 * `Referer` à un tiers qui n'a pas à les recevoir (§26).
 */
export async function relayPhoto(
  raw: string | null,
  userAgent: string,
  cors: Record<string, string>,
): Promise<Response> {
  if (raw === null || raw === '') {
    return new Response('URL manquante', { status: 400, headers: cors });
  }
  if (!relayable(raw)) {
    // 403 et non 404 : l'URL existe peut-être, c'est le relais qui la refuse.
    return new Response('Hôte non relayé', { status: 403, headers: cors });
  }

  let upstream: Response;
  try {
    upstream = await fetch(raw, {
      headers: { 'User-Agent': userAgent, Accept: 'image/*' },
      redirect: 'follow',
      // Le cache de Cloudflare porte le gros du trafic : une même photo est vue
      // par la liste, la fiche et la notification.
      cf: { cacheTtl: 86_400, cacheEverything: true },
    } as RequestInit);
  } catch {
    // L'hôte est en HTTP simple et sans garantie de disponibilité : son silence
    // n'est pas une panne de notre côté (§69).
    return new Response('Photo injoignable', { status: 502, headers: cors });
  }

  if (!upstream.ok) {
    return new Response('Photo absente', { status: upstream.status, headers: cors });
  }

  const type = upstream.headers.get('Content-Type') ?? '';
  if (!ALLOWED_TYPES.test(type.split(';')[0]?.trim() ?? '')) {
    // Un hôte qui rend une page d'erreur en HTML avec un code 200 ne doit pas
    // se retrouver servi sous notre domaine.
    return new Response('Ce n’est pas une image', { status: 415, headers: cors });
  }

  const length = Number(upstream.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BYTES) {
    return new Response('Photo trop lourde', { status: 413, headers: cors });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': type,
      // Un jour dans le navigateur : ces photos ne changent pas, et le trafic
      // évité est autant de requêtes Worker en moins.
      'Cache-Control': 'public, max-age=86400',
      // L'hôte d'origine ne doit pas dicter ce que le navigateur fait du corps.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
