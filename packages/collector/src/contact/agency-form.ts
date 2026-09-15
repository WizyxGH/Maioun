/**
 * Envoyer le formulaire de contact d'une agence, à la demande expresse de
 * l'utilisateur.
 *
 * Appelé par le Worker, jamais par la collecte : l'utilisateur a vu dans une
 * fenêtre de confirmation chaque champ, le message et les cases cochées, puis
 * cliqué « Envoyer ». Le module exécute ce geste et rend compte ; il ne décide
 * de rien.
 *
 * Aucune dépendance Node : le Worker l'embarque tel quel.
 *
 * Sources relevées le 2026-09-15 :
 *   - Orpi : ni CAPTCHA ni jeton CSRF, robots.txt n'interdit pas le chemin
 *     du formulaire. Pris en charge.
 *   - Partners Immo (Apimo) : reCAPTCHA v2 invisible. Écarté.
 *   - Méditerranée Immo (La Boîte Immo) : reCAPTCHA v3. Écarté.
 *   - Elitimo (Twimmo) : reCAPTCHA Enterprise et champs pièges. Écarté ;
 *     l'agence publie contact@elitimo.com, le message part par e-mail.
 * Un CAPTCHA dit que le site ne veut pas d'envoi automatisé : on s'en tient
 * alors à « copier le message et ouvrir le formulaire ».
 */

import { blockingRule, parseRobots } from '../core/robots.js';
import { parseContactForm } from './orpi-form.js';

/** Ce que l'utilisateur a relu et confirmé. */
export interface AgencyFormFields {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly message: string;
}

/** Une case à cocher du formulaire, telle que la page la présente. */
export interface ConsentBox {
  readonly name: string;
  readonly label: string;
  /** Obligatoire pour envoyer (acceptation RGPD). Les autres ne sont jamais cochées. */
  readonly required: boolean;
}

/** Ce que la fenêtre de confirmation doit montrer avant tout envoi. */
export interface AgencyFormPreview {
  readonly sourceId: string;
  readonly sourceName: string;
  /** Hôte qui recevra le message. */
  readonly host: string;
  readonly consents: readonly (ConsentBox & { readonly ticked: boolean })[];
}

export type AgencyFormOutcome =
  | { readonly status: 'preview'; readonly preview: AgencyFormPreview }
  | { readonly status: 'sent'; readonly httpStatus: number; readonly message: string }
  /** Parti, mais la réponse ne permet pas d'affirmer que l'agence l'a accepté. */
  | { readonly status: 'uncertain'; readonly httpStatus: number | null; readonly message: string }
  | {
      readonly status: 'rejected';
      readonly httpStatus: number | null;
      readonly message: string;
      readonly errors: readonly string[];
    }
  /** Rien n'est parti : robots.txt, CAPTCHA apparu, formulaire absent… */
  | { readonly status: 'unavailable'; readonly message: string }
  | { readonly status: 'invalid'; readonly message: string };

/** Le formulaire lu sur la page au moment de l'envoi. */
interface ParsedForm {
  readonly action: string;
  readonly prefix: string;
  readonly hidden: Readonly<Record<string, string>>;
  readonly consents: readonly ConsentBox[];
}

interface Adapter {
  readonly name: string;
  readonly hosts: readonly string[];
  parse(html: string, pageUrl: string): ParsedForm | null;
  build(
    form: ParsedForm,
    fields: AgencyFormFields,
    accepted: readonly string[],
  ): URLSearchParams | string;
  interpret(response: Response): Promise<AgencyFormOutcome>;
}

/** Les sources écartées, et pourquoi : l'interface peut le dire. */
export const AGENCY_FORM_REFUSALS: Readonly<Record<string, string>> = {
  'partners-immo': 'Le formulaire de Partners Immo est protégé par un reCAPTCHA.',
  'mediterranee-immo': 'Le formulaire de Méditerranée Immo est protégé par un reCAPTCHA.',
};

const CAPTCHA_MARKERS: readonly [RegExp, string][] = [
  [/g-recaptcha|grecaptcha|recaptcha\/api\.js|recaptcha\/enterprise/i, 'reCAPTCHA'],
  [/h-captcha|hcaptcha\.com/i, 'hCaptcha'],
  [/cf-turnstile|challenges\.cloudflare\.com\/turnstile/i, 'Turnstile'],
  [/frc-captcha|friendlycaptcha/i, 'Friendly Captcha'],
];

/** Le nom du CAPTCHA présent sur la page, ou `null`. */
export function detectCaptcha(html: string): string | null {
  for (const [pattern, name] of CAPTCHA_MARKERS) if (pattern.test(html)) return name;
  return null;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&rsquo;': '’',
};

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[#a-z0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1];
}

/** Le corps du formulaire nommé, de sa balise ouvrante à sa fermeture. */
function formBody(html: string, formName: string): string {
  const start = html.search(new RegExp(`<form\\b[^>]*\\bname="${formName}"`, 'i'));
  if (start < 0) return '';
  const end = html.indexOf('</form>', start);
  return html.slice(start, end < 0 ? undefined : end);
}

/**
 * Les cases à cocher d'un formulaire, avec leur libellé lisible.
 *
 * Un libellé seul peut tromper : chez Orpi, « Par téléphone » n'a de sens
 * qu'avec la phrase du groupe, « J'accepte de recevoir de la prospection
 * commerciale ». On lui joint donc le premier paragraphe de son `fieldset`.
 */
export function parseConsentBoxes(body: string): readonly ConsentBox[] {
  const boxes: ConsentBox[] = [];
  for (const match of body.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype="checkbox"/i.test(tag)) continue;
    const name = attribute(tag, 'name');
    if (name === undefined) continue;
    const id = attribute(tag, 'id');
    const label =
      id === undefined
        ? ''
        : textOf(
            new RegExp(`<label\\b[^>]*\\bfor="${id}"[^>]*>([\\s\\S]*?)</label>`, 'i').exec(
              body,
            )?.[1] ?? '',
          );
    const before = body.slice(0, match.index);
    const fieldset = before.lastIndexOf('<fieldset');
    const context =
      fieldset >= 0 && before.indexOf('</fieldset>', fieldset) < 0
        ? textOf(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(before.slice(fieldset))?.[1] ?? '')
        : '';
    boxes.push({
      name,
      label: [context, label].filter((part) => part !== '').join(' ') || name,
      required: /\srequired(?:[\s=/>]|$)|data-pristine-required/i.test(tag),
    });
  }
  return boxes;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contrôle ce qui peut l'être avant de déranger l'agence. `null` si tout va. */
export function validateFields(fields: AgencyFormFields): string | null {
  if (fields.firstName.trim() === '' || fields.lastName.trim() === '') {
    return 'Le prénom et le nom sont requis.';
  }
  if (!EMAIL.test(fields.email.trim())) return 'L’adresse e-mail n’est pas valide.';
  if (fields.message.trim() === '') return 'Le message est vide.';
  const tooLong =
    fields.firstName.length > 100 ||
    fields.lastName.length > 100 ||
    fields.email.length > 200 ||
    fields.phone.length > 30 ||
    fields.message.length > 5000;
  return tooLong ? 'Un des champs est trop long.' : null;
}

// Le motif que la page Orpi applique elle-même au téléphone.
const ORPI_PHONE = /^(?:(?:\+33|0033)[1-9](?:[\s.-]?\d{2}){4}|0[1-9](?:[\s.-]?\d{2}){4})$/;

const orpi: Adapter = {
  name: 'Orpi',
  hosts: ['www.orpi.com', 'orpi.com'],

  parse(html, pageUrl) {
    const form = parseContactForm(html, pageUrl);
    if (form === null) return null;
    return { ...form, consents: parseConsentBoxes(formBody(html, form.prefix)) };
  },

  build(form, fields, accepted) {
    const phone = fields.phone.trim();
    if (phone !== '' && !ORPI_PHONE.test(phone)) {
      return 'Orpi refuse ce format de téléphone (attendu : 06 00 00 00 00).';
    }
    const body = new URLSearchParams(form.hidden);
    const set = (name: string, value: string): void => body.set(`${form.prefix}[${name}]`, value);
    set('firstName', fields.firstName.trim());
    set('lastName', fields.lastName.trim());
    set('email', fields.email.trim());
    // Champ piège à robots, invisible : un humain le laisse vide.
    set('email2', '');
    set('phone', phone);
    set('message', fields.message.trim());
    const refused = tickRequired(body, form.consents, accepted);
    return refused ?? body;
  },

  async interpret(response) {
    const httpStatus = response.status;
    if (httpStatus >= 300 && httpStatus < 400) {
      return {
        status: 'uncertain',
        httpStatus,
        message: 'Orpi a répondu par une redirection : l’envoi n’a pas pu être confirmé.',
      };
    }
    const type = response.headers.get('content-type') ?? '';
    const data: unknown = type.includes('json') ? await response.json().catch(() => null) : null;
    if (typeof data === 'object' && data !== null) {
      const record = data as { success?: unknown; errors?: unknown; message?: unknown };
      if (record.success === true && response.ok) {
        return { status: 'sent', httpStatus, message: 'Orpi a accepté le message.' };
      }
      const errors = Array.isArray(record.errors)
        ? record.errors
            .map((error: unknown) => (error as { message?: unknown } | null)?.message)
            .filter((message): message is string => typeof message === 'string')
        : [];
      if (typeof record.message === 'string') errors.push(record.message);
      return { status: 'rejected', httpStatus, message: 'Orpi a refusé le message.', errors };
    }
    if (response.ok) {
      // Le formulaire répond en JSON ; une page HTML ne dit pas si c'est passé.
      return {
        status: 'uncertain',
        httpStatus,
        message: 'Réponse inattendue d’Orpi : l’envoi n’a pas pu être confirmé.',
      };
    }
    return {
      status: 'rejected',
      httpStatus,
      message: `Orpi a refusé la requête (${httpStatus}).`,
      errors: [],
    };
  },
};

/**
 * Coche les cases OBLIGATOIRES que l'utilisateur a vues et acceptées ; jamais
 * les facultatives (prospection, partenaires).
 *
 * @returns un motif de refus si une case obligatoire n'a pas été acceptée —
 *          elle a pu apparaître entre la confirmation et l'envoi.
 */
function tickRequired(
  body: URLSearchParams,
  consents: readonly ConsentBox[],
  accepted: readonly string[],
): string | null {
  for (const consent of consents) {
    if (!consent.required) continue;
    if (!accepted.includes(consent.name)) {
      return `Case obligatoire non acceptée : « ${consent.label} ».`;
    }
    body.set(consent.name, '1');
  }
  return null;
}

const ADAPTERS: Readonly<Record<string, Adapter>> = { orpi };

/** `true` si Maïoun sait envoyer le formulaire de cette source. */
export function agencyFormSupported(sourceId: string): boolean {
  return Object.hasOwn(ADAPTERS, sourceId);
}

export interface AgencyFormRequest {
  readonly sourceId: string;
  readonly pageUrl: string;
  readonly fields: AgencyFormFields;
  /** Noms des cases obligatoires que la confirmation a montrées. */
  readonly acceptedConsents: readonly string[];
  /** `preview` lit le formulaire sans rien poster. */
  readonly mode: 'preview' | 'send';
  readonly userAgent: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

function unavailable(message: string): AgencyFormOutcome {
  return { status: 'unavailable', message };
}

/** Les règles robots.txt du site, ou un motif de refus. */
async function robotsRules(
  origin: string,
  request: AgencyFormRequest,
  doFetch: typeof fetch,
): Promise<ReturnType<typeof parseRobots> | string> {
  try {
    const response = await doFetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': request.userAgent },
      signal: AbortSignal.timeout(request.timeoutMs ?? 10_000),
    });
    // Fichier absent : tout est permis ; site en panne : on s'abstient.
    if (response.status >= 500) return 'robots.txt injoignable';
    if (!response.ok) return [];
    const token = request.userAgent.split('/')[0] ?? request.userAgent;
    return parseRobots(await response.text(), token);
  } catch {
    return 'robots.txt injoignable';
  }
}

function pathOf(url: URL): string {
  return `${url.pathname}${url.search}`;
}

/** Le cookie de session posé par la page, renvoyé comme le ferait le navigateur. */
function cookiesOf(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const all = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return all
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((pair) => pair.includes('='))
    .join('; ');
}

/**
 * Lit le formulaire sur la page, puis — en mode `send` seulement — le poste.
 *
 * Tout est relu à chaque appel (action, champs cachés, cases) : un gabarit qui
 * change ne fait pas partir un envoi vers une adresse périmée.
 */
export async function runAgencyForm(request: AgencyFormRequest): Promise<AgencyFormOutcome> {
  const adapter = ADAPTERS[request.sourceId];
  if (adapter === undefined) {
    return unavailable(
      AGENCY_FORM_REFUSALS[request.sourceId] ??
        'Envoi direct non pris en charge pour cette source.',
    );
  }
  let page: URL;
  try {
    page = new URL(request.pageUrl);
  } catch {
    return { status: 'invalid', message: 'Adresse d’annonce illisible.' };
  }
  if (page.protocol !== 'https:' || !adapter.hosts.includes(page.hostname)) {
    return { status: 'invalid', message: `Cette adresse n’appartient pas à ${adapter.name}.` };
  }
  if (request.mode === 'send') {
    const problem = validateFields(request.fields);
    if (problem !== null) return { status: 'invalid', message: problem };
  }

  const doFetch = request.fetchImpl ?? fetch;
  const rules = await robotsRules(page.origin, request, doFetch);
  if (typeof rules === 'string') return unavailable(`Envoi suspendu : ${rules}.`);
  if (blockingRule(rules, pathOf(page)) !== null) {
    return unavailable('Le robots.txt du site interdit la lecture de cette page.');
  }

  let html: string;
  let cookies: string;
  try {
    const response = await doFetch(page.toString(), {
      headers: { 'User-Agent': request.userAgent, Accept: 'text/html' },
      signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
    });
    if (!response.ok) return unavailable(`L’annonce ne répond plus (${response.status}).`);
    html = await response.text();
    cookies = cookiesOf(response);
  } catch {
    return unavailable('La page de l’annonce est injoignable.');
  }

  const captcha = detectCaptcha(html);
  if (captcha !== null) return unavailable(`Le formulaire est protégé par un ${captcha}.`);
  const form = adapter.parse(html, page.toString());
  if (form === null) return unavailable('Aucun formulaire de contact sur la page de l’annonce.');
  const action = new URL(form.action);
  if (action.origin !== page.origin || blockingRule(rules, pathOf(action)) !== null) {
    return unavailable('L’adresse du formulaire n’est pas autorisée.');
  }

  if (request.mode === 'preview') {
    return {
      status: 'preview',
      preview: {
        sourceId: request.sourceId,
        sourceName: adapter.name,
        host: page.hostname,
        consents: form.consents.map((consent) => ({ ...consent, ticked: consent.required })),
      },
    };
  }

  const body = adapter.build(form, request.fields, request.acceptedConsents);
  if (typeof body === 'string') return { status: 'invalid', message: body };

  let response: Response;
  try {
    response = await doFetch(form.action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Le script de la page poste ainsi et attend du JSON en retour.
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'User-Agent': request.userAgent,
        Referer: page.toString(),
        Origin: page.origin,
        ...(cookies !== '' ? { Cookie: cookies } : {}),
      },
      body: body.toString(),
      redirect: 'manual',
      signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
    });
  } catch {
    // Une coupure après l'émission reste possible : on ne conclut pas à l'échec.
    return {
      status: 'uncertain',
      httpStatus: null,
      message: `${adapter.name} n’a pas répondu : l’envoi n’a pas pu être confirmé.`,
    };
  }
  return adapter.interpret(response);
}
