/**
 * Source : ALERTES E-MAIL des portails (§6, §10) — voir `parser.ts`.
 *
 * Voie conforme pour Leboncoin/SeLoger & co. : l'utilisateur crée des alertes,
 * le portail lui envoie les nouvelles annonces par e-mail, Maïoun les lit
 * dans SA boîte (IMAP, lecture seule). Aucune connexion au portail.
 *
 * Désactivée tant qu'`IMAP_USER`/`IMAP_APP_PASSWORD` ne sont pas dans `.env`.
 */

import type {
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { alertAddressTemplate, loadImapConfig } from '../../config.js';
import { fetchAlertEmails, parseBookmark } from '../../core/email-import.js';
import { acceptsRecipients, forwardingToken } from '../../core/alert-recipients.js';
import { locationFromUrl, parseAlertEmail, referenceFromUrl } from './parser.js';

export const EMAIL_ALERTS_DESCRIPTOR: SourceDescriptor = {
  id: 'email-alerts',
  name: 'Alertes e-mail',
  domain: 'imap',
  kind: 'portal',
  method: 'html',
  priority: 1,
  schedule: scheduleFor('portal'),
  // Une requête par annonce NOUVELLE dont le lien de tracking peut être dénoué
  // en URL canonique (voir `resolveCanonicalUrls`) : une résolution de
  // redirection — l'en-tête `location` seul, jamais la page (§10). SeLoger en
  // est exclu, son redirecteur interdisant les robots : en pratique, seules les
  // alertes Bien'ici en consomment. Au-delà du plafond, les annonces restantes
  // gardent leur lien d'origine plutôt que d'insister (§69).
  budget: budgetFor('portal', { maxPagesPerRun: 120, maxListingsPerRun: 200 }),
  // Le portail envoie chaque annonce une fois : son absence des digests
  // suivants ne prouve rien (voir `oneShotListings`).
  oneShotListings: true,
  // Relais de portails : une photo partagée désigne le même bien (§14).
  relaysListings: true,
  enabled: true,
  allowedPaths: [],
  notes:
    'Lit les e-mails d’alerte des portails dans la boîte de l’utilisateur (IMAP, ' +
    'lecture seule) — AUCUN scraping, aucune connexion au portail (§6, §10). ' +
    'Activée si IMAP_USER/IMAP_APP_PASSWORD sont configurés (Gmail par défaut).',
};

export const NOT_CONFIGURED_WARNING =
  'Alertes e-mail inactives : IMAP_USER ou IMAP_APP_PASSWORD absent de cet environnement';

/** Hôtes de redirection des portails : leur lien expire, pas l'annonce. */
const TRACKING_HOSTS = /(^|\.)(click|link|clic|url\d*|email|mail|t)\./i;

/**
 * LES REDIRECTEURS QU'ON NE SUIT PAS, ET POURQUOI.
 *
 * `click.by.seloger.com/robots.txt` dit `User-agent: * / Disallow: /` (vérifié
 * le 2026-09-16). Une interdiction écrite se respecte (§10), et le contrôle du
 * robots.txt la refusait déjà : chaque annonce SeLoger consommait une place du
 * budget pour une requête qui n'était jamais émise, jusqu'à l'épuiser — cent
 * vingt refus par passage, et les annonces suivantes abandonnées en chemin.
 *
 * ON N'Y PERD RIEN QU'ON PUISSE RÉCUPÉRER : le jeton du lien est chiffré, la
 * fiche `www.seloger.com/annonce/<ref>` répond 403 à un client honnête
 * (DataDome) et le site n'a pas de sitemap. Tout ce qu'on aura de SeLoger est
 * ce que le digest écrit — d'où le soin porté à le lire (voir `parser.ts`).
 *
 * Le lien de tracking reste l'adresse de l'annonce : il redirige correctement
 * dans un NAVIGATEUR, ce qui est son seul usage ici.
 */
const TRACKING_FORBIDDEN = /(^|\.)by\.seloger\.com$/i;

/**
 * Remplace un lien de tracking par l'URL canonique de l'annonce.
 *
 * Ces liens périment alors que l'annonce reste en ligne, d'où des « l'URL ne
 * mène à rien ». `redirect: 'manual'` lit le seul en-tête `location` : la page
 * du portail n'est jamais téléchargée (§10). En cas d'échec, on garde le lien
 * d'origine (§69).
 */
async function resolveCanonicalUrls(
  listings: readonly RawListing[],
  context: ScrapeContext,
): Promise<{ listings: RawListing[]; requests: number }> {
  const resolved: RawListing[] = [];
  let requests = 0;

  for (const listing of listings) {
    let host: string;
    try {
      host = new URL(listing.sourceUrl).hostname;
    } catch {
      resolved.push(listing);
      continue;
    }
    if (!TRACKING_HOSTS.test(host) || TRACKING_FORBIDDEN.test(host) || context.shouldStop()) {
      resolved.push(listing);
      continue;
    }

    try {
      const response = await context.fetch(listing.sourceUrl, { redirect: 'manual' });
      requests += 1;
      const target = response.headers['location'];
      if (target !== undefined && /^https?:/i.test(target)) {
        // On retire les paramètres de campagne : l'URL doit rester celle qu'un
        // humain partagerait.
        const url = new URL(target);
        url.search = '';
        const canonical = url.toString();
        // L'URL dénouée porte le VRAI identifiant de l'annonce : on l'adopte à
        // la place de la référence fabriquée depuis le contenu de l'e-mail,
        // qui variait d'un envoi à l'autre et créait des doublons.
        const reference = referenceFromUrl(canonical);
        // L'URL porte aussi la LOCALISATION, absente de la moitié des digests :
        // sans elle, l'annonce n'était comparable à aucune autre au
        // dédoublonnage (les clés sont préfixées par la commune). On ne
        // remplace jamais ce que l'e-mail a publié, on complète (§17).
        const place = locationFromUrl(canonical);
        // Le QUARTIER écrit dans le message l'emporte : « Roquebillière - Bon
        // Voyage » y est nommé en toutes lettres là où l'URL n'en garde qu'un
        // fragment. On complète, on n'écrase jamais (§17).
        const quartier = listing.extra?.['quartier'] === undefined ? place.districtText : undefined;
        resolved.push({
          ...listing,
          ...(reference !== null ? { sourceRef: reference } : {}),
          ...(listing.cityText === undefined && place.cityText !== undefined
            ? { cityText: place.cityText }
            : {}),
          ...(listing.postalCodeText === undefined && place.postalCodeText !== undefined
            ? { postalCodeText: place.postalCodeText }
            : {}),
          ...(quartier !== undefined ? { extra: { ...(listing.extra ?? {}), quartier } } : {}),
          sourceUrl: canonical,
          contactFormUrl: canonical,
        });
        continue;
      }
    } catch (error) {
      context.log('email.resolve_failed', {
        ref: listing.sourceRef,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    resolved.push(listing);
  }

  return { listings: resolved, requests };
}

export const emailAlertsScraper: Scraper = {
  descriptor: EMAIL_ALERTS_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const config = loadImapConfig();
    if (config === null) {
      // Sans avertissement, la source passait pour saine en ne lisant rien :
      // c'est ainsi que la collecte GitHub a tourné des jours sans IMAP_*.
      return {
        sourceId: EMAIL_ALERTS_DESCRIPTOR.id,
        listings: [],
        requestCount: 0,
        pagesFetched: 0,
        stopReason: 'completed',
        warnings: [NOT_CONFIGURED_WARNING],
      };
    }

    // Les échecs IMAP ne sortent qu'en journal de débogage : on les remonte
    // aussi en avertissements, visibles dans l'historique des passages. Sans
    // le texte de l'erreur : l'historique est public, et un message IMAP peut
    // citer l'adresse de la boîte.
    const warnings: string[] = [];
    const log: ScrapeContext['log'] = (event, fields) => {
      if (event === 'email.connect_failed') warnings.push('IMAP : connexion refusée ou impossible');
      if (event === 'email.fetch_failed') warnings.push('IMAP : lecture de la boîte en échec');
      context.log(event, fields);
    };

    /**
     * ON NE REDEMANDE QUE CE QUI EST ARRIVÉ DEPUIS LE DERNIER PASSAGE.
     *
     * La fenêtre de quatre jours était redescendue en entier à chaque fois :
     * 12 161 messages téléchargés en quatorze jours pour 140 réellement reçus,
     * soit 40 % du trafic du projet (relevé du 2026-09-16). Le repère de
     * lecture — `UIDVALIDITY` du dossier et dernier UID vu — vit dans la
     * mémoire de la source ; voir `core/email-import.ts` pour les cas qui
     * forcent une relecture complète.
     *
     * La fenêtre reste posée : elle borne la PREMIÈRE lecture et celles qui
     * suivent une renumérotation de la boîte. Les annonces des portails
     * expirent vite, et rouvrir de vieux liens ne mène qu'à des « plus
     * disponible » (§17, §29).
     */
    const batch = await fetchAlertEmails({
      config,
      log,
      sinceDays: 4,
      bookmark: parseBookmark(context.memo),
    });
    const emails = batch.emails;

    /**
     * QUI A FAIT SUIVRE CE MESSAGE. La boîte lue est celle du PROJET : chaque
     * compte y transfère ses alertes vers une adresse `alertes+<jeton>@…` qui
     * n'est qu'à lui, et c'est ce jeton — tiré au hasard, indevinable — qui dit
     * à qui l'annonce appartient.
     *
     * Le tri n'est pas cosmétique : la boîte reçoit tout ce qu'on lui envoie, et
     * ce qui y entre entre dans la base COMMUNE à tous les comptes. On ne garde
     * donc que ce qui porte un jeton connu, ou ce qui visait la boîte elle-même
     * (voir `acceptsRecipients`).
     */
    const template = alertAddressTemplate();
    const accepted = emails.filter((email) =>
      acceptsRecipients(email.recipients, template, config.user),
    );
    const rejected = emails.length - accepted.length;
    if (rejected > 0) {
      context.log('email.unaddressed_skipped', { skipped: rejected, kept: accepted.length });
    }

    // Toutes les annonces des e-mails, dédoublonnées sur la référence.
    const bySourceRef = new Map<string, RawListing>();
    for (const email of accepted) {
      const token = forwardingToken(email.recipients, template);
      for (const listing of parseAlertEmail(email.body)) {
        if (bySourceRef.has(listing.sourceRef)) continue;
        // Le jeton VOYAGE AVEC L'ANNONCE : c'est la seule trace de qui l'a
        // apportée, et le corps du message ne la porte nulle part.
        bySourceRef.set(
          listing.sourceRef,
          token === null
            ? listing
            : { ...listing, extra: { ...listing.extra, forwardedBy: token } },
        );
      }
    }
    const all = [...bySourceRef.values()];

    // Déjà connues → confirmées sans réécriture ; nouvelles → à normaliser (§32).
    const confirmedRefs = all
      .filter((listing) => context.isKnown(listing.sourceRef))
      .map((listing) => listing.sourceRef);
    const fresh = all.filter((listing) => !context.isKnown(listing.sourceRef));
    // Les liens de tracking sont résolus en URL canonique AVANT d'enregistrer :
    // c'est cette URL que l'utilisateur ouvrira, parfois des jours plus tard.
    const { listings, requests } = await resolveCanonicalUrls(fresh, context);

    context.log('email.parsed', {
      emails: accepted.length,
      listings: all.length,
      new: listings.length,
      resolved: requests,
      fullRead: batch.fullRead,
    });

    /**
     * UN MESSAGE SANS ANNONCE N'EST PAS UN PARSEUR CASSÉ.
     *
     * Le cœur marque « dégradée » une source qui a téléchargé des pages sans
     * rien y découvrir — le bon réflexe pour une liste HTML. Mais la boîte
     * reçoit aussi des messages de service (bienvenue, connexion, relance) : en
     * lecture incrémentale, un passage peut n'en lire qu'un seul et ne rien
     * trouver, sans que rien ne soit cassé. `empty` est le mot que le cœur
     * attend pour « rien à voir, source saine » (§69).
     */
    const stopReason =
      accepted.length > 0 && all.length === 0 ? ('empty' as const) : ('completed' as const);

    return {
      sourceId: EMAIL_ALERTS_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount: accepted.length + requests,
      pagesFetched: accepted.length,
      stopReason,
      warnings,
      // Pas de repère rendu : le passage n'a rien pu conclure, le cœur garde le
      // précédent et la fenêtre sera relue — jamais l'inverse.
      ...(batch.bookmark !== null ? { memo: JSON.stringify(batch.bookmark) } : {}),
    };
  },
};
