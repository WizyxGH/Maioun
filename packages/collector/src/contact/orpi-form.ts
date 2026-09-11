/**
 * Remplir le formulaire de contact d'une annonce Orpi.
 *
 * ═══ CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ═══
 *
 * Il PRÉPARE un envoi : il lit le formulaire de la page, l'apparie au profil,
 * et rend le corps de requête exact que le site attend. Il sait aussi le poster.
 *
 * IL N'EST APPELÉ PAR RIEN QUI TOURNE AUJOURD'HUI. Comme `guards.ts` avant lui,
 * il existe pour que le jour venu la mécanique soit écrite, éprouvée et
 * relisible — pas pour envoyer quoi que ce soit ce matin. Le seul chemin qui
 * pourra s'en servir est la candidature automatisée, qui reste derrière son
 * interrupteur global, ses seuils, ses quotas et désormais son abonnement.
 * Le site publié promet « rien n'est envoyé à votre place » ; cette promesse
 * n'est pas entamée par du code qui dort.
 *
 * ═══ LE FORMULAIRE, RELEVÉ SUR LA PAGE LE 2026-09-10 ═══
 *
 *   <form name="request_or_send_contact_form"
 *         method="post"
 *         action="/annonce-appartement-t1-nice-06000-<uuid>/contact/rent?formId=…">
 *     … request_or_send_contact_form[firstName] … [lastName] … [email] …
 *       [email2] … [phone] … [message] …
 *       [allowAgencyCall] … [allowOrpiMailing] …
 *
 * TROIS FORMULAIRES IDENTIQUES cohabitent sur la page — la colonne, la modale,
 * et celui du corps —, distingués par un PRÉFIXE de nom de champ. On lit donc
 * le préfixe sur la page plutôt que de le supposer.
 *
 * L'ACTION NE SE DÉDUIT PAS DE L'URL. La page est
 * `/annonce-location-appartement-…`, l'action `/annonce-appartement-…` : le
 * segment « location- » disparaît. Reconstruire ce chemin à la main marcherait
 * aujourd'hui et casserait au premier changement de gabarit ; on lit l'attribut.
 *
 * AUCUN JETON CSRF sur ce formulaire. Ce n'est pas une invitation : c'est
 * simplement une chose de moins à porter, et cela ne change rien à la règle —
 * on emprunte le chemin que le site a prévu, jamais un autre.
 *
 * ═══ LE CONSENTEMENT NE SE COCHE PAS À LA PLACE DE QUELQU'UN ═══
 *
 * `allowAgencyCall` et `allowOrpiMailing` sont deux cases de CONSENTEMENT :
 * être rappelé par l'agence, recevoir les courriels d'Orpi. Les cocher d'office
 * reviendrait à consentir au nom de l'utilisateur — et pour la seconde, à
 * l'abonner à une liste de diffusion qu'il n'a pas demandée. Elles sont donc
 * FAUSSES par défaut, et ne se lèvent que sur une décision explicite.
 */

import type { TenantProfile } from '@maioun/shared';

/** Ce que la page apprend de son formulaire de contact. */
export interface OrpiContactForm {
  /** URL absolue de destination du POST. */
  readonly action: string;
  /** Préfixe des noms de champs, ex. `request_or_send_contact_form`. */
  readonly prefix: string;
}

/** Ce à quoi l'utilisateur consent, explicitement. Faux par défaut. */
export interface OrpiConsent {
  /** Être rappelé par l'agence au numéro donné. */
  readonly allowAgencyCall: boolean;
  /** Recevoir les communications commerciales d'Orpi. */
  readonly allowOrpiMailing: boolean;
}

/** Aucun consentement : ce qu'on transmet tant que rien n'est dit. */
export const NO_CONSENT: OrpiConsent = { allowAgencyCall: false, allowOrpiMailing: false };

/**
 * Le formulaire de contact d'une page d'annonce Orpi.
 *
 * ON PRÉFÈRE LE FORMULAIRE DU CORPS à celui de la colonne et à celui de la
 * modale : les trois sont identiques, mais c'est celui-là que la page montre
 * sans qu'on ait rien ouvert. À défaut, le premier venu fait l'affaire.
 *
 * @returns le formulaire, ou `null` si la page n'en porte aucun — auquel cas
 *          l'annonce n'est pas contactable par ce canal, et on ne l'invente pas.
 */
export function parseContactForm(html: string, pageUrl: string): OrpiContactForm | null {
  const forms = [
    ...html.matchAll(/<form\b[^>]*\bname="(request_or_send_contact_form[^"]*)"[^>]*>/gi),
  ];
  if (forms.length === 0) return null;

  // Le formulaire du corps porte le nom NU ; les deux autres le suffixent
  // (`_aside`) ou le préfixent (`dialog_`).
  const chosen = forms.find((form) => form[1] === 'request_or_send_contact_form') ?? forms[0];
  const prefix = chosen?.[1];
  const action = /\baction="([^"]+)"/i.exec(chosen?.[0] ?? '')?.[1];
  if (prefix === undefined || action === undefined) return null;

  try {
    return { action: new URL(decodeHtml(action), pageUrl).toString(), prefix };
  } catch {
    return null;
  }
}

/** Les quelques entités que Symfony écrit dans un attribut `action`. */
function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Le corps de requête, prêt à poster.
 *
 * `email2` EST UNE CONFIRMATION, pas un second contact : le formulaire demande
 * deux fois la même adresse, et une divergence le fait refuser. On la recopie.
 *
 * @returns le corps, ou `null` si le profil ne porte pas de quoi remplir les
 *          champs obligatoires — nom, prénom, adresse. On ne poste pas un
 *          formulaire à trous pour se le voir refuser.
 */
export function buildSubmission(
  form: OrpiContactForm,
  profile: TenantProfile,
  message: string,
  consent: OrpiConsent = NO_CONSENT,
): URLSearchParams | null {
  const firstName = profile.firstName.trim();
  const lastName = profile.lastName.trim();
  const email = profile.email.trim();
  if (firstName === '' || lastName === '' || email === '' || message.trim() === '') return null;

  const body = new URLSearchParams();
  const champ = (name: string, value: string): void => body.set(`${form.prefix}[${name}]`, value);
  champ('firstName', firstName);
  champ('lastName', lastName);
  champ('email', email);
  champ('email2', email);
  champ('phone', profile.phone.trim());
  champ('message', message.trim());

  // UNE CASE NON COCHÉE NE S'ENVOIE PAS. C'est ainsi qu'un navigateur se
  // comporte, et la poser à « 0 » vaudrait consentement dans certains cadres.
  if (consent.allowAgencyCall) champ('allowAgencyCall', '1');
  if (consent.allowOrpiMailing) champ('allowOrpiMailing', '1');

  return body;
}

/** Ce qu'on a pu faire, dit sans détour. */
export type SubmitOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Poste le formulaire.
 *
 * CE MODULE NE DÉCIDE RIEN. Il ne consulte ni score, ni quota, ni abonnement :
 * `contact/guards.ts` est le seul endroit autorisé à dire oui. Ici on exécute,
 * et l'on rend compte.
 */
export async function submitContactForm(
  form: OrpiContactForm,
  body: URLSearchParams,
  options: { readonly fetchImpl?: typeof fetch; readonly userAgent: string },
): Promise<SubmitOutcome> {
  const call = options.fetchImpl ?? fetch;
  try {
    const response = await call(form.action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // On annonce qui l'on est, ici comme partout.
        'User-Agent': options.userAgent,
      },
      body: body.toString(),
      // On ne suit pas la redirection de confirmation : elle ne dit rien de
      // plus, et la suivre ferait une requête de plus à la charge du site.
      redirect: 'manual',
    });
    // 302 est la réponse NORMALE d'un formulaire Symfony accepté ; 200 signifie
    // souvent que la page est réaffichée AVEC ses erreurs de validation.
    if (response.status === 302 || response.status === 303) return { ok: true };
    return { ok: false, reason: `réponse inattendue (${response.status})` };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'erreur inconnue' };
  }
}
