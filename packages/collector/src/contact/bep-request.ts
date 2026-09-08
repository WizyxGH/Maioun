/**
 * Demander les coordonnées d'un bien au bulletin abonné BEP (§23, §24).
 *
 * CE MODULE ENVOIE QUELQUE CHOSE À UN TIERS, ce qu'aucun autre du projet ne
 * fait. Le reste dépose des brouillons, ouvre des liens, compose des messages —
 * c'est toujours l'utilisateur qui appuie. Ici, une requête part en son nom
 * vers une agence, sur un abonnement qu'il PAIE et dont l'accès peut lui être
 * retiré. Il l'a demandé explicitement ; le code doit donc être d'autant plus
 * strict que la conséquence n'est pas rattrapable.
 *
 * LE MÉCANISME, RELEVÉ SUR LA PAGE. Chaque annonce du bulletin porte un bouton
 * qui appelle `sendreq(bref)` : la fonction écrit l'identifiant dans le champ
 * caché `demande` du formulaire `monform`, puis le soumet — un POST vers la
 * page du bulletin elle-même. Ce n'est pas `w_demande.php`, qui refuse tout
 * accès direct : c'est le chemin que le site a prévu, et le seul qu'on
 * emprunte (§10).
 *
 * `bref` N'EST PAS LA RÉFÉRENCE DE L'ANNONCE. C'est un identifiant de bulletin,
 * dans un autre espace de numérotation ; il est LU dans le lien de contact que
 * le parseur a conservé, jamais calculé.
 *
 * CE MODULE NE DÉCIDE RIEN. Il ne consulte ni score, ni quota, ni historique :
 * `contact/guards.ts` est le seul endroit autorisé à dire oui. Ici on exécute,
 * et l'on rend compte.
 */

const BASE = 'http://abonnes.beplogement.com';
const LOGIN_URL = `${BASE}/w_login_abonnes.php`;
const INDEX_URL = `${BASE}/w_index_abonnes.php`;

/** Ce qu'on a pu faire, dit sans détour (§17). */
export type RequestOutcome =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface BepCredentials {
  readonly user: string;
  readonly password: string;
}

/**
 * L'identifiant de bulletin contenu dans une URL de demande.
 *
 * Le parseur range `…/w_demande.php?bullref=641119` dans `contactFormUrl`.
 * `null` dès que l'adresse n'a pas cette forme — une annonce dont la demande a
 * déjà été envoyée n'a plus de bouton, et pointe l'accueil du bulletin. On ne
 * devine alors rien (§17).
 */
export function bulletinRefFrom(contactFormUrl: string | null): string | null {
  if (contactFormUrl === null) return null;
  return /[?&]bullref=(\d+)\b/.exec(contactFormUrl)?.[1] ?? null;
}

/** Assemble les cookies d'un en-tête `Set-Cookie` dans un pot. */
function collectCookies(headers: Headers, jar: Map<string, string>): void {
  for (const raw of headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0]?.trim();
    if (pair !== undefined && pair.includes('=')) {
      jar.set(pair.slice(0, pair.indexOf('=')), pair);
    }
  }
}

export interface SendRequestDeps {
  readonly credentials: BepCredentials;
  readonly userAgent: string;
  /** Injecté par les tests : la suite n'accède jamais au réseau (§59). */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Envoie UNE demande d'informations, pour UNE annonce.
 *
 * La session ne survit pas d'une requête à l'autre sur ce site : le POST de
 * connexion rend directement la page authentifiée. On se connecte donc à
 * chaque envoi, et l'on poste dans la foulée — c'est ce que fait le navigateur.
 */
export async function sendBepRequest(
  bulletinRef: string,
  deps: SendRequestDeps,
): Promise<RequestOutcome> {
  const doFetch = deps.fetchImpl ?? fetch;
  const jar = new Map<string, string>();
  const headers = { 'User-Agent': deps.userAgent };

  try {
    const first = await doFetch(INDEX_URL, { headers });
    collectCookies(first.headers, jar);

    const login = await doFetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: [...jar.values()].join('; '),
      },
      body: new URLSearchParams({
        abonlogin1: deps.credentials.user,
        abonpassword: deps.credentials.password,
        'Envoyer.x': '10',
        'Envoyer.y': '10',
      }).toString(),
      redirect: 'manual',
    });
    collectCookies(login.headers, jar);

    const page = await login.text();
    // Le formulaire de connexion encore présent = la connexion a échoué. On le
    // dit plutôt que de poster dans le vide.
    if (/abonpassword/i.test(page)) {
      return { ok: false, reason: 'connexion refusée par le bulletin' };
    }

    // LES SIX CHAMPS DU FORMULAIRE, tels que la page les déclare. En omettre un
    // ferait traiter la demande comme un rafraîchissement de la liste.
    const response = await doFetch(INDEX_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: [...jar.values()].join('; '),
        Referer: INDEX_URL,
      },
      body: new URLSearchParams({
        updt: '0',
        addadate: '',
        references: '',
        demande: bulletinRef,
        nbel: '20',
        bullsel: '1',
      }).toString(),
    });

    if (!response.ok) return { ok: false, reason: `le bulletin a répondu ${response.status}` };

    /**
     * ON VÉRIFIE QUE LA DEMANDE A ÉTÉ PRISE, et l'on ne se contente pas d'un
     * 200 : le site rend la même page à tout POST. Le bouton de CETTE annonce
     * disparaît une fois la demande envoyée — c'est la seule preuve que la
     * page nous donne, et elle est de bonne qualité.
     */
    const after = await response.text();
    if (new RegExp(`sendreq\\(${bulletinRef}\\)`).test(after)) {
      return { ok: false, reason: 'la demande ne semble pas avoir été enregistrée' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'échec réseau' };
  }
}
