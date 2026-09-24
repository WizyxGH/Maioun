/**
 * LE CAPTCHA DE CLOUDFLARE, sur la création de compte et la connexion.
 *
 * Le débit limitait déjà les tentatives — trois inscriptions par heure et par
 * origine, et un plafond sur la connexion. Mais un débit se contourne en
 * changeant d'origine, et il ne distingue pas un humain lent d'un script
 * patient. Le captcha pose la question autrement.
 *
 * TURNSTILE ET NON RECAPTCHA : le Worker vit déjà chez Cloudflare, le service
 * est gratuit, et il n'envoie rien à Google. La plupart des visiteurs ne voient
 * rien du tout — la vérification est passive tant que rien n'est suspect.
 *
 * LE JETON SE VÉRIFIE CÔTÉ SERVEUR, TOUJOURS. Celui que le navigateur rend ne
 * prouve rien tant que Cloudflare ne l'a pas confirmé : un script en fabrique
 * un faux en une ligne. Et il ne vaut QU'UNE FOIS — Cloudflare refuse un jeton
 * déjà consommé, ce qui interdit de le rejouer.
 */

/** L'adresse officielle de vérification. */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Ce dont la vérification a besoin : la clé secrète, et de quoi joindre le service. */
export interface CaptchaEnv {
  readonly TURNSTILE_SECRET?: string;
}

/** Le verdict, et la raison quand il est négatif — pour le journal, pas pour l'écran. */
export interface CaptchaVerdict {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * `true` si le captcha est en service.
 *
 * SANS SECRET, IL NE L'EST PAS, et il faut que cela s'entende : un garde-fou
 * qui se croit posé sans l'être est pire que pas de garde-fou. L'appelant
 * journalise son absence à chaque tentative plutôt que de la taire.
 */
export function captchaConfigured(env: CaptchaEnv): boolean {
  return typeof env.TURNSTILE_SECRET === 'string' && env.TURNSTILE_SECRET !== '';
}

/**
 * Vérifie un jeton auprès de Cloudflare.
 *
 * `fetcher` est injecté pour que le test n'ait pas besoin du réseau : c'est la
 * seule dépendance extérieure de cette fonction.
 */
export async function verifyCaptcha(
  env: CaptchaEnv,
  token: unknown,
  remoteIp: string | null,
  fetcher: typeof fetch = fetch,
): Promise<CaptchaVerdict> {
  const secret = env.TURNSTILE_SECRET;
  if (secret === undefined || secret === '') return { ok: true, reason: 'non configuré' };
  if (typeof token !== 'string' || token.trim() === '') {
    return { ok: false, reason: 'jeton absent' };
  }

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  // L'adresse du visiteur resserre la vérification ; Cloudflare l'accepte
  // absente, et le Worker ne la connaît pas toujours.
  if (remoteIp !== null && remoteIp !== '') form.append('remoteip', remoteIp);

  let payload: { success?: unknown; 'error-codes'?: unknown };
  try {
    const response = await fetcher(SITEVERIFY, { method: 'POST', body: form });
    payload = (await response.json()) as typeof payload;
  } catch (error) {
    // LE SERVICE INJOIGNABLE NE FERME PAS LA PORTE. Une panne de Cloudflare
    // empêcherait sinon toute connexion, y compris la vôtre — le captcha
    // protège d'un abus, il ne garde pas un coffre.
    return { ok: true, reason: `vérification impossible : ${String(error)}` };
  }

  if (payload.success === true) return { ok: true };
  const codes = Array.isArray(payload['error-codes']) ? payload['error-codes'].join(', ') : '';
  return { ok: false, reason: codes === '' ? 'refusé' : codes };
}
