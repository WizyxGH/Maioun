/**
 * Préparation du contact — MODE MANUEL (§22).
 *
 * GARANTIE CENTRALE : ce composant n'envoie jamais rien tout seul.
 *
 * Il affiche les coordonnées disponibles, compose un message, et propose
 * quatre actions que seul l'utilisateur peut déclencher :
 *   [Modifier] éditer le texte
 *   [Copier]   mettre dans le presse-papiers
 *   [Ouvrir]   ouvrir le client mail, le téléphone ou le formulaire
 *   [Envoyé]   consigner que le contact a eu lieu (§33, §35)
 *
 * Le bouton « Envoyé » ne transmet aucun message : il enregistre le fait que
 * l'utilisateur a agi, pour le suivi et les statistiques.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  formatArea,
  formatPhone,
  formatPrice,
  formatOccurrenceSource,
  telHref,
} from '../format.js';
import { safeHref } from '../safe-url.js';
import {
  awaitsContact,
  dossierFacileLink,
  FOLLOW_UP_TEMPLATE,
  portalLabel,
  prepareMessage,
  type TenantProfile,
} from '@maioun/shared';
import type { ListingView, OccurrenceView } from '../types.js';
import { SOURCES } from '../sources.generated.js';
import { canStoreDocuments, fetchDocuments, type DocumentInfo } from '../api/client.js';
import { Button, ButtonLink, buttonVariants } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Check, Mail, PhoneCall, X } from './icons.js';
import { Textarea } from '@/components/ui/textarea.js';
import { dossierSlots, slotOf } from '../dossier.js';
import { hrefOf } from '../router.js';
import { nextHistoryState } from '../use-route.js';
import { cn } from '@/lib/utils.js';
import { AgencyFormSend } from './AgencyFormSend.js';
import { DossierFacileOffer } from './DossierFacileOffer.js';

interface ContactPanelProps {
  readonly listing: ListingView;
  readonly profile: TenantProfile | null;
  readonly onRecorded: (channel: string, message: string, documents: readonly string[]) => void;
  readonly onConfigureProfile: () => void;
  /** Ouvre la fiche de la source : ses infos et ses annonces actives. */
  readonly onOpenSource?: (sourceId: string) => void;
}

/** Construit le lien à ouvrir selon le canal disponible. */
function actionLink(
  channel: string,
  recipient: string | null,
  subject: string,
  body: string,
): string | null {
  if (recipient === null) return null;
  if (channel === 'email') {
    return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  if (channel === 'phone') return `tel:${recipient}`;
  // L'adresse du formulaire est recopiée d'un site tiers : elle ne devient un
  // lien que si c'en est un.
  if (channel === 'form') return safeHref(recipient);
  return null;
}

const MUTED_NOTE = 'my-1.5 text-[0.82rem] text-muted-foreground';

/**
 * Les sources de cette annonce qui VENDENT la mise en relation.
 *
 * LocService en est une : ses annonces viennent de propriétaires particuliers
 * — précisément ce qui manque à un inventaire presque entièrement agence — mais
 * son métier est de facturer le contact. Le propriétaire ne publie donc aucune
 * coordonnée, et le projet n'en cherche pas (§10, §21).
 *
 * On le dit AVANT le clic. Sans cela l'écran affichait « ouvrez l'annonce
 * d'origine pour utiliser le canal prévu par le site » — vrai à la lettre, et
 * trompeur : le canal prévu est un péage, et le silence passait pour de
 * l'ignorance.
 *
 * Le fait vient du descripteur de la source, pas d'une liste tenue ici : une
 * liste dans l'interface dérive dès qu'une source change de modèle.
 */
function paidContactSources(occurrences: readonly OccurrenceView[]): readonly string[] {
  const names = new Set<string>();
  for (const occurrence of occurrences) {
    if (SOURCES[occurrence.sourceId]?.paidContact === true) {
      names.add(formatOccurrenceSource(occurrence));
    }
  }
  return [...names];
}

/** Libellé du bouton d'ouverture, explicite selon le canal disponible. */
function openButtonLabel(channel: string, recipient: string | null): string {
  if (channel === 'email') return 'Ouvrir l’e-mail';
  if (channel === 'phone') return 'Appeler';
  if (channel === 'form') {
    const portal = portalLabel(recipient);
    return portal !== null ? `Contacter via ${portal}` : 'Ouvrir le formulaire';
  }
  return 'Ouvrir';
}

/**
 * Une occurrence : la source, en lien vers l'annonce d'origine.
 *
 * Le loyer et la surface ne sont rappelés QUE s'ils diffèrent de ceux retenus
 * plus haut. Les répéter à l'identique sous chaque source encombrait la fiche
 * d'une information déjà lue trois lignes au-dessus ; les taire quand elles
 * divergent, en revanche, masquerait un désaccord entre sources (§15).
 */
function SourceRow({
  occurrence,
  price,
  area,
}: {
  readonly occurrence: OccurrenceView;
  readonly price: number | null;
  readonly area: number | null;
}): React.JSX.Element {
  const differs = occurrence.price !== price || occurrence.area !== area;
  return (
    <>
      <a
        // Adresse venue du site collecté : sans schéma web, pas de lien du tout
        // — un `javascript:` s'exécuterait ici dans notre origine.
        href={safeHref(occurrence.sourceUrl) ?? undefined}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex min-h-6 items-center text-primary underline"
      >
        {formatOccurrenceSource(occurrence)}
      </a>
      {differs && (
        <span className="text-muted-foreground">
          {' '}
          — {formatPrice(occurrence.price)}, {formatArea(occurrence.area)}
        </span>
      )}
    </>
  );
}

function ContactDetails({
  listing,
  hasAnyContact,
  onCalled,
  onWritten,
  onOpenSource,
}: {
  readonly listing: ListingView;
  readonly hasAnyContact: boolean;
  /** Appelé au clic sur « Appeler » : le suivi passe à « contactée ». */
  readonly onCalled: () => void;
  /** Idem au clic sur « Écrire ». */
  readonly onWritten: () => void;
  readonly onOpenSource?: (sourceId: string) => void;
}): React.JSX.Element {
  const { name, agencyName, phone, email, formUrl, reference, providedBy } = listing.contact;
  // La source qui a fourni ces coordonnées, à défaut la première occurrence.
  const contactSource = providedBy[0] ?? listing.occurrences[0]?.sourceId ?? null;
  const openSource =
    onOpenSource !== undefined && contactSource !== null
      ? (): void => onOpenSource(contactSource)
      : null;
  const occurrences = listing.occurrences;
  // Le formulaire mène souvent à l'annonce elle-même : la ligne « Source »
  // ci-dessous porte alors déjà ce lien, et la répéter n'apprend rien (§15).
  const formIsSource = formUrl !== null && occurrences.some((o) => o.sourceUrl === formUrl);
  const paidSources = paidContactSources(occurrences);
  return (
    <>
      <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[0.92rem]">
        {name !== null && (
          <>
            <dt className="text-muted-foreground">Interlocuteur</dt>
            <dd>{name}</dd>
          </>
        )}
        {agencyName !== null && (
          <>
            <dt className="text-muted-foreground">Agence</dt>
            <dd>
              {/* Le nom mène à SA PAGE ICI : ses coordonnées, l'état de sa
                collecte, et toutes ses annonces actives — ce qu'on veut avant
                d'appeler.

                Il ouvrait auparavant la page d'ACCUEIL de l'agence, ce qui
                trompait deux fois : on croyait retomber sur l'annonce, et on
                arrivait sur un site à parcourir. Le lien vers l'annonce
                d'origine existe, une ligne plus bas, sous « Source ». */}
              {openSource === null ? (
                agencyName
              ) : (
                <Button
                  type="button"
                  variant="link"
                  size="inline"
                  onClick={openSource}
                  className="font-normal"
                  title={`Voir ${agencyName} et ses annonces`}
                >
                  {agencyName}
                </Button>
              )}
            </dd>
          </>
        )}
        {/* La référence de l'agence : c'est elle qu'on cite au téléphone pour
          désigner le bien. */}
        {reference !== null && reference.trim() !== '' && (
          <>
            <dt className="text-muted-foreground">Réf. agence</dt>
            <dd data-testid="agency-reference">{reference}</dd>
          </>
        )}
        {/* L'ADRESSE, EN CLAIR. Elle n'apparaissait nulle part : seul le
          bouton « Ouvrir l'e-mail » la portait, caché derrière un lien
          `mailto:` qui ouvre un logiciel de courrier que tout le monde n'a
          pas. Le bouton est retiré ; l'adresse, elle, se lit et se copie. */}
        {email !== null && email.trim() !== '' && (
          <>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd data-testid="agency-email" className="break-all select-all">
              {email}
            </dd>
          </>
        )}
        {formUrl !== null && !formIsSource && (
          <>
            <dt className="text-muted-foreground">Formulaire</dt>
            <dd>
              <a
                // Même précaution : l'adresse du formulaire vient de l'agence.
                href={safeHref(formUrl) ?? undefined}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline"
              >
                Ouvrir sur le site
              </a>
            </dd>
          </>
        )}

        {/* §38 : d'où vient l'annonce, avec le lien d'origine. Cette section
          vivait seule en bas de fiche, entre le statut et la description ;
          c'est pourtant une coordonnée comme les autres — le canal par lequel
          on joint le bien. */}
        {occurrences.length > 0 && (
          <>
            <dt className="text-muted-foreground">
              {occurrences.length > 1 ? 'Sources' : 'Source'}
            </dt>
            <dd data-testid="listing-sources">
              {occurrences.map((occurrence) => (
                <span key={occurrence.id} className="block">
                  <SourceRow
                    occurrence={occurrence}
                    price={listing.price.value}
                    area={listing.area.value}
                  />
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      {/* APPELER, EN UN GESTE. Le numéro n'était qu'un lien dans une liste de
        définitions : sur téléphone, il fallait viser dix caractères au milieu
        d'un tableau. Or l'appel est LE geste qui fait obtenir une visite sur ce
        marché — bien avant l'e-mail, souvent lu le lendemain.

        IL A REMPLACÉ LA LIGNE « Téléphone », il ne s'y ajoute pas : le numéro
        écrit deux fois à trois centimètres d'intervalle n'apprend rien la
        seconde, et l'œil doit alors choisir entre deux choses identiques. */}
      {/* L'APPEL COMPTE COMME UNE DÉMARCHE. Le suivi ne connaissait que ce qui
        passe par un brouillon : on appelait, puis l'annonce restait « nouvelle »
        et le rappel « pas encore candidaté » revenait. On enregistre le GESTE,
        pas l'appel — le navigateur ne sait pas si la communication a eu lieu —,
        et seulement la première fois pour ne pas compter une relance à chaque
        clic. Le statut reste modifiable à la main juste au-dessus. */}
      {phone !== null && (
        <a
          href={telHref(phone)}
          onClick={onCalled}
          className={buttonVariants({ className: 'mb-2 w-full gap-2 no-underline' })}
        >
          <PhoneCall aria-hidden="true" className="size-4" />
          Appeler {formatPhone(phone)}
        </a>
      )}

      {/* ÉCRIRE EST UN GESTE AUSSI, et il était une adresse écrite en petit dans
        un tableau — à viser au doigt, puis à recopier. Même bouton que l'appel,
        en second parce que le téléphone obtient une visite plus vite. Le
        message préparé reste plus bas : ici on ouvre son courrier, vide. */}
      {email !== null && (
        <a
          href={`mailto:${email}`}
          onClick={onWritten}
          className={buttonVariants({
            variant: 'outline',
            className: 'mb-4 w-full gap-2 no-underline',
          })}
        >
          <Mail aria-hidden="true" className="size-4" />
          Écrire à {email}
        </a>
      )}

      {/* Le péage, dit avant le clic (§17). Remplace le message générique
        ci-dessous : ici l'absence de coordonnées n'est pas un manque de la
        source, c'est son modèle. */}
      {paidSources.length > 0 && (
        <p className={MUTED_NOTE} data-testid="paid-contact-note">
          {paidSources.join(', ')} {paidSources.length > 1 ? 'facturent' : 'facture'} la mise en
          relation : le propriétaire n’y publie pas ses coordonnées. L’annonce reste consultable
          librement.
        </p>
      )}

      {/* §17 : ne pas faire croire à une coordonnée qui n'existe pas. */}
      {!hasAnyContact && paidSources.length === 0 && (
        <p className={MUTED_NOTE}>
          Aucune coordonnée n’est publiée par les sources. Ouvrez l’annonce d’origine pour utiliser
          le canal prévu par le site.
        </p>
      )}
    </>
  );
}

/** Ouvre un écran de l'application sans recharger la page : le routeur suit l'historique. */
function openInApp(event: React.MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  // `nextHistoryState` et non `null` : sans lui, le « Retour » de l'écran
  // ouvert ici croirait qu'on y est arrivé par un lien direct.
  window.history.pushState(nextHistoryState(), '', event.currentTarget.href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Les pièces à joindre pour candidater, et celles qui manquent encore.
 *
 * La liste est celle du dossier (décret n° 2015-1437), selon les garanties du
 * profil : on voit avant d'écrire si tout est prêt. Les pièces présentes sont
 * consignées avec le contact.
 *
 * UN LIEN DOSSIERFACILE REND TOUT CELA SANS OBJET. Le dossier est alors
 * hébergé et vérifié par le service public, et le message le porte : réclamer
 * des dépôts ici ferait croire qu'il manque quelque chose, et ferait déposer
 * une seconde fois des pièces qu'on n'a plus besoin de garder.
 */
function useDossierChecklist(profile: TenantProfile | null): {
  readonly attached: readonly string[];
  readonly checklist: React.JSX.Element | null;
} {
  // `null` tant que la liste n'est pas arrivée : tout afficher « à déposer »
  // un instant ferait croire à un dossier vide.
  const [documents, setDocuments] = useState<readonly DocumentInfo[] | null>(null);
  const dossier = dossierFacileLink(profile?.dossierFacileUrl);

  useEffect(() => {
    // Rien à demander au serveur quand le dossier vit ailleurs.
    if (dossier !== null || !canStoreDocuments()) return;
    void fetchDocuments()
      .then(setDocuments)
      .catch(() => {
        /* espace des pièces indisponible : pas de liste */
      });
  }, [dossier]);

  if (dossier !== null) {
    return {
      attached: [],
      checklist: (
        <section className="border-good/40 bg-good/5 mt-3 rounded-lg border px-3 py-2">
          <h3 className="text-[0.85rem] font-medium">Dossier vérifié, joint au message</h3>
          <p className="text-muted-foreground mt-1 text-[0.85rem]">
            Le message porte votre lien DossierFacile : le bailleur ouvre un dossier déjà contrôlé,
            et vous choisissez à qui vous le transmettez. Aucune pièce à déposer ici.
          </p>
          <a
            href={dossier}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary mt-1.5 inline-block text-[0.85rem] break-all underline"
          >
            {dossier}
          </a>
        </section>
      ),
    };
  }

  if (profile === null || documents === null) return { attached: [], checklist: null };

  const slots = dossierSlots(profile.guarantors);
  const filled = new Set(documents.map((doc) => slotOf(doc.name)));
  const ready = slots.filter((slot) => filled.has(slot.id)).length;
  const attached = documents
    .filter((doc) => slots.some((slot) => slot.id === slotOf(doc.name)))
    .map((doc) => doc.name);

  const checklist = (
    <>
      {/* AVANT LA LISTE, ET NON APRÈS : celle-ci décrit la voie longue — des
        pièces à déposer ici, que le bailleur devra vérifier lui-même. Qui ne
        connaît pas le service de l'État ne voyait que celle-là. */}
      <DossierFacileOffer className="mt-3" />
      <section
        className="mt-3 rounded-lg border border-border px-3 py-2"
        aria-labelledby="dossier-checklist"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="dossier-checklist" className="text-[0.85rem] font-medium">
            Pièces pour candidater
          </h3>
          <span
            className={cn(
              'text-[0.8rem]',
              ready === slots.length ? 'text-good' : 'text-muted-foreground',
            )}
          >
            {ready}/{slots.length} prête{ready > 1 ? 's' : ''}
          </span>
        </div>
        <ul className="mt-1.5 flex flex-col gap-1">
          {slots.map((slot) => {
            const ok = filled.has(slot.id);
            return (
              <li key={slot.id} className="flex min-w-0 items-center gap-2 text-[0.9rem]">
                {ok ? (
                  <Check aria-hidden="true" className="size-4 shrink-0 text-good" />
                ) : (
                  <X aria-hidden="true" className="size-4 shrink-0 text-medium" />
                )}
                <span className="min-w-0 flex-1 truncate">{slot.label}</span>
                <span className={cn('shrink-0 text-[0.78rem]', ok ? 'sr-only' : 'text-medium')}>
                  {ok ? 'fournie' : 'à déposer'}
                </span>
              </li>
            );
          })}
        </ul>
        {ready < slots.length && (
          <a
            href={hrefOf({ view: 'documents' })}
            onClick={openInApp}
            className="mt-2 inline-block text-[0.85rem] text-primary underline"
          >
            Compléter le dossier
          </a>
        )}
      </section>
    </>
  );

  return { attached, checklist };
}

/**
 * Ce qu'on affiche à la place du message quand le profil manque.
 *
 * Sans lui, rien ne peut être composé : le message cite le métier, le revenu
 * et la date d'emménagement. On le dit, et on offre le seul geste utile.
 */
function MissingProfile({ onConfigure }: { readonly onConfigure: () => void }): React.JSX.Element {
  return (
    <div>
      <p className="mb-2">
        Renseignez votre profil locataire pour générer un message. Il reste stocké uniquement sur
        cet appareil et n’est jamais transmis.
      </p>
      <Button variant="outline" onClick={onConfigure}>
        Configurer mon profil
      </Button>
    </div>
  );
}

export function ContactPanel({
  listing,
  profile,
  onRecorded,
  onConfigureProfile,
  onOpenSource,
}: ContactPanelProps): React.JSX.Element {
  // §34 : une annonce déjà contactée propose une RELANCE, brève, plutôt que
  // de regénérer le premier message.
  const [followUp, setFollowUp] = useState(false);
  const alreadyContacted = listing.tracking === 'contacted';

  // Lien direct de l'annonce (1re occurrence), inséré dans le brouillon.
  const sourceUrl = listing.occurrences[0]?.sourceUrl ?? null;
  const prepared = useMemo(
    () =>
      profile === null
        ? null
        : prepareMessage(
            { ...listing, sourceUrl },
            profile,
            followUp ? FOLLOW_UP_TEMPLATE : undefined,
          ),
    [listing, profile, followUp, sourceUrl],
  );

  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const { attached, checklist } = useDossierChecklist(profile);

  const { phone, email, formUrl } = listing.contact;
  const hasAnyContact = phone !== null || email !== null || formUrl !== null;

  const message = draft ?? prepared?.body ?? '';
  const subject = prepared?.subject ?? '';
  const channel = prepared?.channel ?? 'manual';
  const link = actionLink(channel, prepared?.recipient ?? null, subject, message);
  const openLabel = openButtonLabel(channel, prepared?.recipient ?? null);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé : le texte reste sélectionnable dans la zone.
    }
  };

  return (
    <Card className="my-4" aria-labelledby="contact-title" role="region">
      <h2 id="contact-title" className="mb-2.5 text-base font-semibold">
        Contact
      </h2>

      <ContactDetails
        listing={listing}
        hasAnyContact={hasAnyContact}
        onCalled={() => {
          if (awaitsContact(listing.tracking)) onRecorded('phone', '', []);
        }}
        onWritten={() => {
          if (awaitsContact(listing.tracking)) onRecorded('email', '', []);
        }}
        onOpenSource={onOpenSource}
      />

      {profile === null ? (
        <MissingProfile onConfigure={onConfigureProfile} />
      ) : (
        <>
          {/* §34 : déjà contactée et sans réponse → proposer la relance. */}
          {alreadyContacted && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-medium/50 px-3 py-2 text-sm">
              <span className="flex-1">
                Annonce déjà contactée{followUp ? ' — message de relance préparé.' : '.'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFollowUp((value) => !value);
                  setDraft(null);
                }}
              >
                {followUp ? 'Premier message' : 'Relancer'}
              </Button>
            </div>
          )}
          <label
            className="mt-2 block text-[0.85rem] text-muted-foreground"
            htmlFor="contact-message"
          >
            Message préparé
          </label>
          <Textarea
            id="contact-message"
            className="w-full resize-y text-[0.92rem]"
            value={message}
            readOnly={!editing}
            rows={10}
            onChange={(event) => setDraft(event.target.value)}
          />

          {checklist}

          <MessageActions
            editing={editing}
            copied={copied}
            link={link}
            openLabel={openLabel}
            channel={channel}
            onToggleEdit={() => setEditing((value) => !value)}
            onCopy={() => void handleCopy()}
            onSent={() => onRecorded(channel, message, attached)}
          />

          {/* Envoi direct, après confirmation, pour les sources qui le permettent. */}
          <AgencyFormSend
            listing={listing}
            profile={profile}
            message={message}
            onSent={() => onRecorded('form', message, attached)}
          />

          {channel === 'form' && <FormHint copied={copied} />}
        </>
      )}
    </Card>
  );
}

/**
 * La rangée de gestes : modifier, copier, ouvrir.
 *
 * Sortie de `ContactPanel`, qui portait déjà l'état du brouillon, celui des
 * pièces et la préparation du message.
 *
 * RIEN NE PART TOUT SEUL (§22) : « Ouvrir » ouvre le courrier, le téléphone ou
 * le formulaire, avec le message prêt. C'EST CE GESTE QUI CONSIGNE LA DÉMARCHE.
 * Un bouton « J'ai envoyé » le demandait une seconde fois, après coup, alors
 * qu'on avait déjà quitté la page — et il fallait y penser pour que le suivi
 * soit juste. Comme pour « Appeler » et « Écrire », on enregistre le geste, pas
 * l'envoi : le navigateur ne sait pas ce qu'on a fait dans le client mail.
 */
function MessageActions({
  editing,
  copied,
  link,
  openLabel,
  channel,
  onToggleEdit,
  onCopy,
  onSent,
}: {
  readonly editing: boolean;
  readonly copied: boolean;
  readonly link: string | null;
  readonly openLabel: string;
  readonly channel: string;
  readonly onToggleEdit: () => void;
  readonly onCopy: () => void;
  readonly onSent: () => void;
}): React.JSX.Element {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      <Button variant="outline" onClick={onToggleEdit}>
        {editing ? 'Terminer' : 'Modifier'}
      </Button>

      <Button variant="outline" onClick={onCopy}>
        {copied ? 'Copié' : 'Copier'}
      </Button>

      {/* PAS DE BOUTON POUR LE COURRIER. `mailto:` ouvre un logiciel de
        courrier — souvent aucun, parfois le mauvais — et le message était
        alors perdu. On copie, et l'adresse est affichée au-dessus. Le
        téléphone et le formulaire, eux, mènent quelque part. */}
      {link !== null && channel !== 'email' && (
        <ButtonLink
          // DEUX LIENS PEUVENT DIRE « Appeler » sur cette fiche : celui-ci, qui
          // conclut le message préparé, et le bouton d'appel direct posé plus
          // haut. Ils ne font pas la même chose ; un repère les distingue pour
          // qui les cherche par leur intitulé.
          data-testid="contact-action"
          variant="outline"
          href={link}
          target={channel === 'form' ? '_blank' : undefined}
          rel="noreferrer noopener"
          // Un formulaire web ne se pré-remplit pas : le message doit être
          // collé à la main. On le met donc au presse-papiers AU MOMENT
          // d'ouvrir, pour qu'il soit prêt quand le formulaire s'affiche —
          // sinon il fallait penser à « Copier » d'abord, et revenir.
          onClick={() => {
            if (channel === 'form') onCopy();
            onSent();
          }}
        >
          {openLabel}
        </ButtonLink>
      )}
    </div>
  );
}

/** Confirmation, une fois le formulaire ouvert et le message copié. */
function FormHint({ copied }: { readonly copied: boolean }): React.JSX.Element | null {
  if (!copied) return null;
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Message copié — il ne reste qu’à le coller dans le formulaire.
    </p>
  );
}
