/**
 * Carte d'annonce de la liste principale (§36).
 *
 * Elle doit répondre en un coup d'œil, sur téléphone, à « dois-je contacter
 * cette annonce maintenant ? ». Tout ce qui n'aide pas à cette décision est
 * renvoyé à la fiche détaillée.
 */

import type { ListingView } from '../types.js';
import { archiveReasonOf, isUnavailable, isUncertain } from '../availability.js';
import {
  formatAddress,
  formatAge,
  formatArea,
  formatAvailability,
  formatCity,
  formatDistrict,
  formatDuration,
  formatPrice,
  formatPropertyType,
  formatRooms,
  formatSourceName,
  formatTracking,
} from '../format.js';
import { checkEligibility, type TenantProfile } from '@maioun/shared';
import { PhotoCarousel } from './PhotoCarousel.js';
import { splitPhotos } from '../photos.js';
import {
  awaitsContact,
  PRIORITY_HOT,
  rentAllIn,
  scoreBand,
  SHORT_TERM_LEASE_FEATURE,
  STUDENT_HOUSING_FEATURE,
} from '@maioun/shared';
import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';
import { Progress } from '@/components/ui/progress.js';
import { Flame, Heart, TrainFront } from './icons.js';

interface ListingCardProps {
  readonly listing: ListingView;
  readonly nowMs: number;
  /**
   * Rang dans la liste, pour l'apparition en cascade. Absent = pas
   * d'animation d'entrée : c'est le cas d'une carte isolée.
   */
  readonly rank?: number;
  /** Ouvre la fiche. Toute la carte y mène — voir le commentaire du rendu. */
  readonly onOpen: (id: string) => void;
  /** Met (`true`) ou retire (`false`) l'annonce des favoris. */
  readonly onFavorite?: (favorite: boolean) => void;
  /**
   * Le profil locataire, pour confronter le dossier aux conditions de l'annonce.
   *
   * Absent quand il n'est pas rempli : aucune carte n'est alors marquée, ce qui
   * est juste — on ne peut rien conclure d'un dossier qu'on ne connaît pas.
   */
  readonly profile?: TenantProfile | null;
}

/**
 * Palier de priorité → libellé. La COULEUR, elle, ne varie plus : la barre est
 * verte partout, et c'est sa LONGUEUR qui compare deux annonces. Un dégradé de
 * teintes ajoutait un second code à déchiffrer pour la même information.
 *
 * Verte, parce qu'une priorité haute est une BONNE nouvelle — une annonce à
 * saisir, pas une alerte.
 */
function priorityLabel(priority: number, awaits: boolean): string {
  // « À CONTACTER » SUR UNE ANNONCE DÉJÀ CONTACTÉE : le libellé ne regardait
  // que la note, si bien qu'une carte portait « Contactée » et « À contacter »
  // à trois centimètres d'écart — relevé du 2026-09-17. La section « À
  // contacter maintenant » applique déjà `awaitsContact` ; la carte, non, et
  // c'est elle qu'on lit dans les autres tris, où la section n'existe pas.
  // UN SEUL VOCABULAIRE : la carte disait « à étudier » là où la fiche dit
  // « Dans la liste ». Les paliers et leurs noms vivent avec le score.
  if (priority >= PRIORITY_HOT && !awaits) return 'priorité haute';
  return scoreBand(priority).label.toLowerCase();
}

/**
 * Le score, en BARRE DE PROGRESSION (§36).
 *
 * Une barre plutôt qu'un nombre seul : deux cartes se comparent d'un coup
 * d'œil, sans lire. Le chiffre reste à côté, et la fiche porte le détail de ce
 * qui le compose.
 */
function PriorityBar({
  priority,
  awaits,
}: {
  readonly priority: number;
  /** `false` dès qu'un geste a été posé : ni flamme ni « à contacter ». */
  readonly awaits: boolean;
}): React.JSX.Element | null {
  // SANS COMPTE, IL N'Y A PAS DE PRIORITÉ : elle se calcule sur des critères qui
  // appartiennent à quelqu'un. L'API rend alors zéro, et « 0/100 · à étudier »
  // s'affichait sur toutes les cartes comme un verdict.
  if (priority <= 0) return null;
  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 text-[0.68rem] font-semibold tracking-wide text-good uppercase">
          {priority >= PRIORITY_HOT && awaits && <Flame aria-hidden="true" className="size-3.5" />}
          {priorityLabel(priority, awaits)}
        </span>
        {/* « 65/100 » et non « 65 » : le barème est ainsi dit, sans que
          l'utilisateur ait à deviner sur quoi la note est donnée. */}
        <span className="text-[0.95rem] leading-none font-bold text-good">
          {priority}
          <span className="text-[0.75rem] font-medium text-muted-foreground">/100</span>
        </span>
      </div>
      <Progress value={priority} aria-label="Priorité d’action" indicatorClassName="bg-good" />
    </div>
  );
}

/** Archivée à la main, ou d'office : louée, retirée, fermée aux candidatures. */
function isArchived(listing: ListingView): boolean {
  return archiveReasonOf(listing) !== null;
}

/** Réversible : un dossier refusé rouvre une place, d'où l'absence de grisé. */
function ApplicationsFullBadge({
  listing,
  rented,
}: {
  readonly listing: ListingView;
  readonly rented: boolean;
}): React.JSX.Element | null {
  if (listing.applicationStatus !== 'full' || rented) return null;
  return <Badge variant="warning">Candidatures fermées</Badge>;
}

/**
 * Ce que les conditions du bailleur disent de CE dossier, en un mot.
 *
 * LE DOSSIER NE PASSE PAS, ET ON LE DIT AVANT LE CLIC. Sans ce repère, on ouvre
 * la fiche, on lit, on appelle, on envoie son dossier — et le refus tombe sur
 * un critère écrit dès l'annonce. Rien n'est masqué pour autant : le bailleur
 * peut faire une exception, et c'est à l'utilisateur de juger.
 */
function RequirementBadges({
  listing,
  profile,
}: {
  readonly listing: ListingView;
  readonly profile: TenantProfile | null | undefined;
}): React.JSX.Element | null {
  const requirements = listing.requirements;
  if (requirements === undefined) return null;

  const verdict =
    profile != null
      ? checkEligibility(requirements, profile, listing.price.value).verdict
      : 'unknown';

  if (verdict === 'income') return <Badge variant="warning">Revenu exigé</Badge>;
  if (verdict === 'situation') return <Badge variant="warning">Situation non listée</Badge>;
  if (verdict === 'guarantee') return <Badge variant="warning">Garantie refusée</Badge>;

  /**
   * LA GLI N'EST PAS UN REFUS, C'EST UNE EXIGENCE : un repère neutre, et rien
   * de plus quand un autre badge dit déjà ce qui coince. Elle compte parce que
   * c'est alors l'assureur qui fixe les critères, sans exception possible.
   */
  if (requirements.insuredRent === true) return <Badge>Garantie loyers impayés</Badge>;
  return null;
}

/**
 * Pastilles de statut, empilées par ordre de priorité. « Loué » prime sur tout
 * (§32) ; le suivi n'affiche qu'un seul statut, le plus avancé (« Consultée »
 * seulement si aucune action n'a suivi). Isolé de `ListingCard` pour la clarté.
 */
function StatusBadges({
  listing,
  rented,
  archived,
  profile,
}: {
  readonly listing: ListingView;
  readonly rented: boolean;
  readonly archived: boolean;
  readonly profile: TenantProfile | null | undefined;
}): React.JSX.Element {
  return (
    <>
      {rented && <Badge variant="bad">Loué</Badge>}
      {archiveReasonOf(listing) === 'offline' && <Badge variant="bad">Plus en ligne</Badge>}
      {/* Absente de sa source au dernier passage : probablement retirée (§32). */}
      {isUncertain(listing) && !rented && <Badge variant="warning">Peut-être retirée</Badge>}
      {archived && !isUnavailable(listing) && <Badge variant="warning">Archivée</Badge>}
      {listing.tracking !== 'new' ? (
        <Badge>{formatTracking(listing.tracking)}</Badge>
      ) : (
        listing.viewed === true && !archived && <Badge>Consultée</Badge>
      )}
      {listing.priceDropped === true && <Badge variant="good">Prix en baisse</Badge>}
      {listing.reappeared === true && <Badge variant="good">De retour en ligne</Badge>}
      <ApplicationsFullBadge listing={listing} rented={rented} />
      <RequirementBadges listing={listing} profile={profile} />
      {/* PLUS DE BADGE « TROP BEAU ? » ICI. C'était un second nom, avec son
        propre seuil, pour le score que la fiche appelle « Signaux d'alerte » :
        un seul calcul donnait l'impression de deux vérifications. Le doute se
        lit désormais à un seul endroit, la fiche, avec ses raisons et avant le
        message à écrire — deux mots sur une carte ne se vérifient pas. Ce que
        le risque pèse reste ici, dans la note de priorité qui l'intègre. */}
      {listing.flatShare?.value === true && <Badge variant="warning">Colocation</Badge>}
      {/* Bail de neuf mois : le logement n'est pas louable l'été. Le taire
        laisserait croire à un logement à l'année (§17). */}
      {listing.features?.includes(SHORT_TERM_LEASE_FEATURE) === true && (
        <Badge variant="warning">Bail 9 mois</Badge>
      )}
      {/* Réservé aux étudiants : condition d'ACCÈS, pas argument de vente.
        Le badge ne s'affiche que sur les formes qui engagent la durée ou
        l'éligibilité — jamais sur un « idéal étudiant » (§17). */}
      {listing.features?.includes(STUDENT_HOUSING_FEATURE) === true && (
        <Badge variant="warning">Réservé aux étudiants</Badge>
      )}
    </>
  );
}

/**
 * L'ADRESSE, ÉCRITE COMME SUR UNE ENVELOPPE.
 *
 * La voie était dans le titre, tronquée, et la ville sur la ligne d'en dessous :
 * deux morceaux d'une même information, dont le plus utile ne tenait pas. Les
 * voici réunis — « 230 Av. de la Californie, 06200 Nice ».
 *
 * Sans voie connue, la ligne se réduit à la ville : mieux vaut une adresse
 * courte qu'une adresse inventée (§17).
 */
function postalLine(listing: ListingView, cityLine: string): string {
  const street = listing.address.value !== null ? formatAddress(listing.address.value) : null;
  return street !== null ? `${street}, ${cityLine}` : cityLine;
}

/**
 * En-tête d'une carte : titre, adresse, prix.
 *
 * LA RUE A QUITTÉ LE TITRE. Elle y était, et la ville juste en dessous : la
 * même localisation écrite deux fois, en deux morceaux, dont le plus précis
 * était tronqué par le titre — « Appartement · 230 Av. de la Cali… ». Le titre
 * dit maintenant CE QUE C'EST et où, en gros ; la ligne d'adresse dit OÙ, tout
 * entière, dans l'ordre où on l'écrirait sur une enveloppe.
 *
 * Le quartier reste au titre quand on l'a : il situe sans répéter la voie.
 */
/**
 * SOUS QUELLE BASE LE LOYER EST ÉCRIT, quand la source le dit.
 *
 * Deux annonces à « 690 € » ne coûtent pas la même chose si l'une compte ses
 * charges et l'autre non, et la carte les rangeait côte à côte sans le dire.
 * Le total prime dans la phrase : c'est lui qu'on paie, et c'est à lui que le
 * budget se compare. Rien quand la source se tait — on n'invente pas de
 * provision, et un loyer nu n'est pas présenté comme un total.
 */
function RentBasisNote({ listing }: { readonly listing: ListingView }): React.JSX.Element | null {
  const price = listing.price.value;
  const charges = listing.charges.value;
  const included = listing.chargesIncluded ?? null;
  if (price === null || included === null) return null;
  if (included) {
    return (
      <p className="text-[0.8rem] text-muted-foreground">
        charges comprises{charges === null ? '' : ` (dont ${formatPrice(charges)})`}
      </p>
    );
  }
  if (charges === null) return <p className="text-[0.8rem] text-muted-foreground">hors charges</p>;
  return (
    <p className="text-[0.8rem] text-muted-foreground">
      + {formatPrice(charges)} de charges = {formatPrice(price + charges)} par mois
    </p>
  );
}

/**
 * Le loyer tel qu'un lecteur d'écran l'annonce : ce qu'on PAIE, pas seulement
 * ce qui est écrit en gros. Un loyer hors charges y passait pour le total.
 */
function spokenRent(listing: ListingView): string {
  const included = listing.chargesIncluded ?? null;
  const allIn = rentAllIn({
    price: listing.price.value,
    charges: listing.charges.value,
    chargesIncluded: included,
  });
  if (allIn === null) return `${formatPrice(listing.price.value)} par mois`;
  return `${formatPrice(allIn)} par mois${included === false ? ' charges comprises' : ''}`;
}

function CardHeading({
  listing,
  addressLine,
}: {
  readonly listing: ListingView;
  /** Adresse postale la plus complète disponible. Jamais vide. */
  readonly addressLine: string;
}): React.JSX.Element {
  const district = listing.district?.value ?? null;
  const place = district !== null ? formatDistrict(district) : formatCity(listing.city.value);
  return (
    <div className="min-w-0 flex-1">
      <h2 className="truncate text-base font-semibold">
        {formatPropertyType(listing.propertyType.value)} · {place}
      </h2>
      <p className="truncate text-[0.8rem] text-muted-foreground">{addressLine}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <strong className="text-xl font-extrabold tracking-tight">
          {formatPrice(listing.price.value)}
        </strong>
        {/* « / mois » : un loyer se lit par mois, et rien ne le disait. Un
            montant nu se confondait avec un prix de vente sur les fiches où la
            source hésite elle-même. */}
        <span className="text-[0.9rem] text-muted-foreground">
          / mois · {formatArea(listing.area.value)} · {formatRooms(listing.rooms.value)}
        </span>
      </p>
      <RentBasisNote listing={listing} />
    </div>
  );
}

export function ListingCard({
  listing,
  nowMs,
  rank,
  onOpen,
  onFavorite,
  profile,
}: ListingCardProps): React.JSX.Element {
  const sources = [...new Set(listing.occurrences.map((occurrence) => occurrence.sourceId))];
  const archived = isArchived(listing);
  const rented = listing.rented === true;
  const uncertain = isUncertain(listing);
  const favorite = listing.favorite === true;
  const publishedAt = listing.publishedAt.value;
  const postal = listing.postalCode?.value ?? null;
  // Format postal français, comme partout ailleurs (§20) : « 06000 Nice ».
  const cityLine = `${postal !== null ? `${postal} ` : ''}${formatCity(listing.city.value)}`;

  const addressLine = postalLine(listing, cityLine);

  // La carte reste épurée : pas de pastilles DPE/atouts (réservées à la
  // fiche) ; seule la disponibilité, décisive pour agir, est affichée.
  const availability = formatAvailability(listing.availableAt.value, nowMs);

  // Photos, affichées directement depuis le site d'origine (§11 : jamais
  // téléchargées ni stockées) et défilables sur la carte même. Certaines
  // sources listent la même photo en plusieurs tailles (/original/,
  // /1600xauto/, /640x480/…) : on dédoublonne sur l'URL débarrassée de son
  // segment de taille pour ne pas montrer deux fois la même image. Sans photo,
  // la carte reste purement textuelle.
  //
  // Les photos que le navigateur refuserait (http sur une page https) sont
  // écartées ici : la carte n'a pas la place d'expliquer, la fiche s'en charge
  // et propose les liens.
  const seenPhotoKeys = new Set<string>();
  const photos = splitPhotos(listing.imageUrls ?? [])
    .embeddable.filter((url) => {
      const key = url.replace(/\/(original|\d+x(?:auto|\d+)|auto x\d+|thumb\w*)\//i, '/');
      if (seenPhotoKeys.has(key)) return false;
      seenPhotoKeys.add(key);
      return true;
    })
    .slice(0, 6);

  // Résumé lu à voix haute par les lecteurs d'écran : sans lui, la carte
  // n'annoncerait qu'un amas de chiffres.
  const label = `${spokenRent(listing)}, ${formatArea(listing.area.value)}, ${addressLine} — ouvrir la fiche`;

  return (
    <Card
      // TOUTE LA CARTE ouvre la fiche au clic. Les commandes qui restent (cœur,
      // flèches du carrousel) arrêtent la propagation, sinon les manipuler
      // ferait aussi changer de page.
      onClick={() => onOpen(listing.id)}
      // Le survol soulève d'un pixel et l'appui l'enfonce : sur téléphone,
      // où il n'y a pas de survol, `active:` est le seul retour qui dise que
      // le doigt a été reçu — la fiche met un instant à s'ouvrir.
      // PAS DE BORDURE DE PRIORITÉ : l'encadré orange criait sur une carte sur
      // trois. La flamme et la barre de priorité le disent déjà, sans bruit.
      className={`${rank === undefined ? '' : 'rf-rise '}relative cursor-pointer overflow-hidden transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-sm has-[>button:focus-visible]:ring-2 has-[>button:focus-visible]:ring-ring ${
        archived ? 'opacity-60' : uncertain ? 'opacity-70' : ''
      } ${isUnavailable(listing) ? 'grayscale' : ''}`}
      data-testid="listing-card"
      {...(rank === undefined
        ? {}
        : {
            // Au-delà de la dizaine, le décalage cumulé se verrait comme une
            // attente : on plafonne, les cartes suivantes entrent ensemble.
            style: { '--rf-delay': `${Math.min(rank, 10) * 30}ms` } as React.CSSProperties,
          })}
    >
      {/* Au clavier, un vrai bouton plutôt qu'une carte `role="button"` : un
          bouton ne peut pas en contenir d'autres, et le cœur en est un. Il
          laisse passer la souris, dont le clic remonte à la carte. */}
      <button
        type="button"
        aria-label={label}
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none"
      />
      {/* La photo ne porte plus de pastille de score : la barre de priorité,
          sous le titre, joue ce rôle et laisse l'image entière. */}
      {photos.length > 0 && (
        <div className={archived ? 'grayscale' : undefined}>
          <PhotoCarousel urls={photos} />
        </div>
      )}
      <header className="flex items-start gap-3">
        <CardHeading listing={listing} addressLine={addressLine} />

        <span className="flex shrink-0 flex-col items-end gap-1">
          {onFavorite !== undefined && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFavorite(!favorite);
              }}
              title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              aria-pressed={favorite}
              // L'étoile seule ne faisait que ~20 px de haut : trop petit pour
              // être visé au doigt. La zone cliquable est portée à 36 px sans
              // grossir le symbole.
              className={`-mt-1 flex size-9 cursor-pointer items-center justify-center text-xl leading-none transition-colors ${
                favorite ? 'text-favorite' : 'text-muted-foreground hover:text-favorite'
              }`}
            >
              {/* `key` change avec l'état : React remonte l'icône, ce qui
                relance l'animation. Sans cela elle ne jouerait qu'une fois. */}
              <Heart
                key={favorite ? 'on' : 'off'}
                aria-hidden="true"
                weight={favorite ? 'fill' : 'regular'}
                className={`size-5 ${favorite ? 'rf-pop' : ''}`}
              />
            </button>
          )}
          <StatusBadges listing={listing} rented={rented} archived={archived} profile={profile} />
        </span>
      </header>

      <PriorityBar priority={listing.actionPriority} awaits={awaitsContact(listing.tracking)} />

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] text-muted-foreground">
        <span>
          {publishedAt === null
            ? `Découverte ${formatAge(listing.firstSeenAt, nowMs)}`
            : `Publiée ${formatAge(publishedAt, nowMs)}`}
        </span>
        {availability !== null && <span className="text-foreground">{availability}</span>}
        {/* §20 : durée (transport réel si dispo, sinon estimée) + vol d'oiseau. */}
        {listing.distances.map((distance) => (
          <span key={distance.label} className="text-foreground">
            <span className="text-muted-foreground">{distance.label} </span>
            {distance.durationSource === 'transit' && (
              <span aria-hidden="true" title="Temps réel en transports en commun">
                <TrainFront aria-hidden="true" className="inline size-4" />{' '}
              </span>
            )}
            {formatDuration(distance.durationMinutes)}
            {distance.distanceKm !== undefined && (
              <span className="text-muted-foreground">
                {' '}
                ({distance.distanceKm} km à vol d’oiseau)
              </span>
            )}
          </span>
        ))}
      </div>

      {/* §13, §38 : d'où vient l'annonce et combien de fois elle circule. */}
      <p className="mt-1 text-[0.85rem] text-muted-foreground">
        {sources.length === 1 ? '1 source' : `${sources.length} sources`} ·{' '}
        {sources.map(formatSourceName).join(', ')}
      </p>
    </Card>
  );
}
