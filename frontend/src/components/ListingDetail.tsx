/**
 * Fiche détaillée d'une annonce (§37, §38).
 *
 * Elle doit permettre d'AGIR vite : les coordonnées et le message sont en haut,
 * le détail des scores et l'historique en dessous.
 */

import { Fragment, useEffect, useState } from 'react';
import type { StoredReferencePoint, TenantProfile } from '@maioun/shared';
import { rentAllIn, RISK_ALERT } from '@maioun/shared';
import { fetchReferencePoints } from '../api/client.js';
import { archiveReasonOf, isArchivedBySource, isUncertain } from '../availability.js';
import { directionsUrl } from '../directions.js';
import type { ListingView, TrackingStatus } from '../types.js';
import {
  formatPostalAddress,
  formatAge,
  formatArea,
  formatCity,
  formatDuration,
  formatPrice,
  formatPropertyType,
  formatRooms,
  formatSourceName,
  formatTracking,
  TRACKING_ORDER,
  UNKNOWN,
} from '../format.js';
import { ScoreDetail } from './Scores.js';
import { ContactPanel } from './ContactPanel.js';
import { RequirementsPanel } from './RequirementsPanel.js';
import { PhotoCarousel } from './PhotoCarousel.js';
import { splitPhotos } from '../photos.js';
import { readableDescription } from '../description-text.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Select } from '@/components/ui/select.js';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  ExternalLink,
  Heart,
  ImageOff,
  MapPin,
  Share,
  TrainFront,
} from './icons.js';
import { shareLink } from '../share-link.js';

interface ListingDetailProps {
  readonly listing: ListingView;
  readonly profile: TenantProfile | null;
  readonly nowMs: number;
  readonly onBack: () => void;
  /** Archive (`true`) ou désarchive (`false`) l'annonce. */
  readonly onArchive?: (archived: boolean) => void;
  /** Met (`true`) ou retire (`false`) l'annonce des favoris. */
  readonly onFavorite?: (favorite: boolean) => void;
  readonly onTrackingChange: (status: TrackingStatus) => void;
  readonly onContactRecorded: (
    channel: string,
    message: string,
    documents: readonly string[],
  ) => void;
  /** Ouvre la fiche de la source : ses infos et ses annonces actives. */
  readonly onOpenSource?: (sourceId: string) => void;
  readonly onConfigureProfile: () => void;
}

/** Affiche une valeur divergente entre sources plutôt que de la masquer (§15). */
function ConflictNote({
  conflicts,
  render,
}: {
  readonly conflicts: readonly { value: unknown; sourceId: string }[];
  readonly render: (value: unknown) => string;
}): React.JSX.Element | null {
  if (conflicts.length === 0) return null;
  return (
    <span
      className="text-[0.85rem] text-medium"
      title="Les sources ne s’accordent pas sur cette valeur"
    >
      {' '}
      (
      {conflicts.map((conflict, index) => (
        <span key={`${conflict.sourceId}-${index}`}>
          {index > 0 && ', '}
          {render(conflict.value)} selon {formatSourceName(conflict.sourceId)}
        </span>
      ))}
      )
    </span>
  );
}

/**
 * Suivi du statut (§35).
 *
 * Il vivait sous le bloc Contact, après une page entière de faits : on le
 * cherchait. Sa place est près du prix — c'est une ACTION sur l'annonce, pas
 * une de ses caractéristiques.
 */
function TrackingSelect({
  listing,
  onChange,
}: {
  readonly listing: ListingView;
  readonly onChange: (status: TrackingStatus) => void;
}): React.JSX.Element {
  return (
    <section className="mb-4 flex items-center gap-2">
      <label htmlFor="tracking-select" className="text-muted-foreground">
        Statut
      </label>
      <Select
        id="tracking-select"
        value={listing.tracking}
        onChange={(event) => onChange(event.target.value as TrackingStatus)}
      >
        {TRACKING_ORDER.map((status) => (
          <option key={status} value={status}>
            {formatTracking(status)}
          </option>
        ))}
      </Select>
    </section>
  );
}

/**
 * Les deux gestes qu'on porte sur une annonce : la retenir, l'écarter.
 *
 * La carte de liste ouvrant la fiche sur toute sa surface, elle ne peut plus
 * porter que le cœur ; et depuis une fiche ouverte par une notification, rien
 * ne permettait de retenir l'annonce sans revenir en arrière.
 */
function DetailActions({
  title,
  favorite,
  archived,
  onFavorite,
  onArchive,
}: {
  readonly title: string;
  readonly favorite: boolean;
  readonly archived: boolean;
  readonly onFavorite?: (favorite: boolean) => void;
  readonly onArchive?: (archived: boolean) => void;
}): React.JSX.Element {
  // Sans feuille native (ordinateur), le lien est copié : le bouton le dit.
  const [copied, setCopied] = useState(false);
  const share = async (): Promise<void> => {
    const outcome = await shareLink({ title, url: window.location.href });
    if (outcome !== 'copied') return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const shareLabel = copied ? 'Lien copié' : 'Partager l’annonce';
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => void share()}
        title={shareLabel}
        aria-label={shareLabel}
      >
        {copied ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Share aria-hidden="true" className="size-4" />
        )}
      </Button>
      {onFavorite !== undefined && (
        <Button
          variant="ghost"
          onClick={() => onFavorite(!favorite)}
          title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-pressed={favorite}
          className={favorite ? 'text-favorite' : undefined}
        >
          <Heart aria-hidden="true" weight={favorite ? 'fill' : 'regular'} className="size-4" />
        </Button>
      )}
      {onArchive !== undefined && (
        <Button
          variant="ghost"
          onClick={() => onArchive(!archived)}
          title={archived ? 'Désarchiver' : 'Archiver'}
          aria-label={archived ? 'Désarchiver' : 'Archiver'}
        >
          {archived ? (
            <ArchiveRestore aria-hidden="true" className="size-4" />
          ) : (
            <Archive aria-hidden="true" className="size-4" />
          )}
        </Button>
      )}
    </>
  );
}

/** « le 14 septembre » : la date à laquelle l'annonce a été vue en ligne pour la dernière fois. */
function lastSeenDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : ` le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/**
 * Pourquoi ce bien n'est plus disponible, dit en tête de fiche.
 *
 * On arrive souvent ici par un lien — notification, recherche partagée,
 * favori ancien — sans être passé par la liste qui l'aurait écarté : la fiche
 * doit dire d'emblée qu'il est trop tard, et pourquoi, avant photos et prix.
 *
 * La RAISON vient d'`archiveReasonOf`, celle qui range l'annonce avec les
 * archivées : recopier sa cascade ici aurait permis à la fiche d'annoncer
 * autre chose que ce que la liste a décidé. Seul « peut-être retirée » lui est
 * propre — elle reste affichée, donc `archiveReasonOf` ne la retient pas.
 */
function AvailabilityNotice({
  listing,
}: {
  readonly listing: ListingView;
}): React.JSX.Element | null {
  let title: string;
  let detail: string;
  let variant: 'destructive' | 'warning' | 'default' = 'warning';
  const reason = archiveReasonOf(listing);

  if (reason === 'rented') {
    variant = 'destructive';
    title = 'Ce logement est loué';
    detail = 'L’annonceur l’a indiqué comme loué : il n’est plus possible de candidater.';
  } else if (reason === 'offline') {
    variant = 'destructive';
    title = 'Cette annonce n’est plus en ligne';
    detail = `Elle a disparu de sa source — vue pour la dernière fois${lastSeenDay(listing.lastSeenAt)}. Le bien est très probablement loué ou retiré.`;
  } else if (reason === 'applicationsFull') {
    title = 'Candidatures fermées';
    detail =
      'L’annonceur n’accepte plus de dossier pour ce bien pour le moment (plafond de candidatures atteint ou dépôts suspendus). L’annonce est rangée avec les archivées et reviendra d’elle-même si les candidatures rouvrent.';
  } else if (isUncertain(listing)) {
    title = 'Peut-être plus disponible';
    detail = `Absente de sa source lors des derniers passages — vue pour la dernière fois${lastSeenDay(listing.lastSeenAt)}. Vérifiez sur l’annonce d’origine avant de contacter.`;
  } else if (reason === 'user') {
    variant = 'default';
    title = 'Annonce archivée';
    detail = 'Vous l’avez archivée : elle n’apparaît plus dans la liste ni dans les alertes.';
  } else {
    return null;
  }

  return (
    <Alert variant={variant} className="mb-3">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}

/**
 * CE QUI A ÉTÉ OBSERVÉ SUR CETTE ANNONCE, AVANT D'ÉCRIRE.
 *
 * Le score de risque était le seul à n'avoir aucune place dans la décision :
 * un badge de deux mots sur la carte, et ses raisons repliées en bas de fiche,
 * sous le message déjà rédigé. Elles arrivent donc ici, à côté des conditions
 * du bailleur, parce que savoir qu'un loyer est trois fois sous le marché
 * change ce qu'on demande — ou la décision de demander.
 *
 * IL ALERTE, IL N'ACCUSE PAS. Pas un mot de verdict, pas d'« arnaque » : les
 * raisons sont recopiées telles que le score les a écrites, chacune disant ce
 * qui a été vu. Le reste du score — ce qui joue en faveur de l'annonce, ce
 * qu'aucune source n'a fourni — garde sa place plus bas, entière.
 */
function RiskAlert({ listing }: { readonly listing: ListingView }): React.JSX.Element | null {
  const risk = listing.scores.risk;
  if (risk.value < RISK_ALERT) return null;
  // Seules les raisons qui PÈSENT : « Loyer cohérent avec le marché » et
  // « Agence identifiable » valent zéro point et n'ont rien à avertir.
  const observed = (risk.reasons ?? []).filter((reason) => reason.delta > 0);
  if (observed.length === 0) return null;

  return (
    <Alert variant="warning" className="mb-3">
      <AlertTitle>Signaux d’alerte</AlertTitle>
      <AlertDescription>
        <ul>
          {observed.map((reason, index) => (
            <li key={`${reason.code}-${index}`}>{reason.label}</li>
          ))}
        </ul>
        <p>
          Aucun de ces constats ne prouve quoi que ce soit. Ils demandent une vérification avant
          d’envoyer un dossier, et surtout avant tout versement.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * La provision, et le TOTAL qu'elle fait quand le loyer l'ignore.
 *
 * « + 158 € de charges » laissait l'addition au lecteur, et c'est cette
 * addition que le budget compare : « 566 € + 158 € = 724 € par mois » dit d'un
 * coup ce que coûte le logement. Charges déjà comprises, rien à additionner.
 */
function ChargesNote({ listing }: { readonly listing: ListingView }): React.JSX.Element | null {
  const charges = listing.charges.value;
  if (charges === null) return null;
  if (listing.chargesIncluded === true) {
    return <span className="text-sm text-muted-foreground"> dont {charges} € de charges</span>;
  }
  const total = rentAllIn({
    price: listing.price.value,
    charges,
    chargesIncluded: listing.chargesIncluded ?? null,
  });
  return (
    <span className="text-sm text-muted-foreground">
      {' + '}
      {charges} € de charges
      {total === null ? '' : ` = ${formatPrice(total)} par mois`}
    </span>
  );
}

/** Ce qui se paie à l'entrée, sous le loyer. Rien quand la source ne dit rien. */
function EntryCosts({ listing }: { readonly listing: ListingView }): React.JSX.Element | null {
  const deposit = listing.deposit?.value ?? null;
  const fees = listing.tenantFees?.value ?? null;
  if (deposit === null && fees === null) return null;
  return (
    <p className="-mt-2 mb-3 text-sm text-muted-foreground">
      {deposit !== null && <span>Dépôt de garantie : {formatPrice(deposit)}</span>}
      {deposit !== null && fees !== null && <span aria-hidden="true"> · </span>}
      {fees !== null && <span>Honoraires : {formatPrice(fees)}</span>}
    </p>
  );
}

/** Grille étiquette/valeur utilisée par la fiche et le contact. */
const FACTS_GRID = 'mb-4 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[0.92rem]';
const FACT_LABEL = 'text-muted-foreground';

/**
 * « Classe D », ou l'inconnu. Les deux étiquettes du diagnostic — énergie et
 * climat — s'écrivent pareil, et une fiche ancienne n'en porte aucune.
 */
const classeOu = (etiquette: ListingView['dpe']): string =>
  etiquette?.value != null && etiquette.value !== '' ? `Classe ${etiquette.value}` : UNKNOWN;

/**
 * Photos qu'on ne peut pas afficher, mais qu'on peut ouvrir.
 *
 * Le bulletin abonné de BEP héberge ses photos sur des serveurs qui ne parlent
 * que le http ; un navigateur les bloque sur une page https. Plutôt que de
 * laisser l'annonce muette — ce qu'elle était : le carrousel les retirait une
 * à une sans rien dire —, on donne les liens et on explique pourquoi.
 */
function Photos({ urls }: { readonly urls: readonly string[] }): React.JSX.Element | null {
  const photos = splitPhotos(urls);
  if (photos.embeddable.length > 0) {
    return (
      <div className="mb-3 overflow-hidden rounded-xl">
        <PhotoCarousel urls={photos.embeddable.slice(0, 12)} tall />
      </div>
    );
  }
  if (photos.linkOnly.length === 0) return null;
  return <LinkOnlyPhotos urls={photos.linkOnly.slice(0, 12)} />;
}

function LinkOnlyPhotos({ urls }: { readonly urls: readonly string[] }): React.JSX.Element {
  return (
    <div className="bg-muted/60 mb-3 rounded-xl border border-dashed p-3">
      <p className="text-muted-foreground mb-2 flex items-center gap-2 text-[0.85rem]">
        <ImageOff aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {urls.length} photo{urls.length > 1 ? 's' : ''} — le site de la source ne les sert qu’en
          http, le navigateur refuse de les afficher ici. Elles restent ouvrables&nbsp;:
        </span>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {urls.map((url, position) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="bg-background hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.8rem] transition-colors"
            >
              Photo {position + 1}
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Requête Maps : la localisation la plus précise disponible (§20). Rue si
 * connue, sinon quartier. Chaîne vide quand il n'y a rien à pointer.
 *
 * PAS DE LIEN SUR LA SEULE VILLE. Beaucoup d'alertes e-mail ne publient que
 * « 06000 Nice » : l'épingle et le lien promettaient alors une adresse, et
 * déposaient l'utilisateur au centre-ville. Un lien qui n'apprend rien vaut
 * moins que pas de lien (§17, §20).
 */
function mapsQueryOf(listing: ListingView): string {
  const placed = listing.address.value ?? listing.district.value;
  if (placed === null || placed === '' || placed === UNKNOWN) return '';
  return [placed, listing.postalCode.value, formatCity(listing.city.value)]
    .filter((part): part is string => part !== null && part !== '' && part !== UNKNOWN)
    .join(', ');
}

/**
 * Les points de référence, chargés UNE FOIS pour toutes les fiches.
 *
 * La promesse est retenue au niveau du module : ouvrir dix annonces ne doit pas
 * relire dix fois un réglage qui ne bouge pas.
 */
let referencePoints: Promise<readonly StoredReferencePoint[] | null> | null = null;

function useReferencePoints(): readonly StoredReferencePoint[] {
  const [points, setPoints] = useState<readonly StoredReferencePoint[]>([]);
  useEffect(() => {
    referencePoints ??= fetchReferencePoints();
    let alive = true;
    void referencePoints.then((list) => {
      if (alive && list !== null) setPoints(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  return points;
}

/**
 * « voir le trajet » — l'itinéraire réel entre un point de référence et le
 * logement.
 *
 * Absent quand l'annonce n'est située que par sa commune : `mapsQueryOf` rend
 * alors une chaîne vide, et un itinéraire vers un centre-ville n'apprend rien.
 */
function DirectionsLink({
  listing,
  distance,
  points,
}: {
  readonly listing: ListingView;
  readonly distance: ListingView['distances'][number];
  readonly points: readonly StoredReferencePoint[];
}): React.JSX.Element | null {
  const url = directionsUrl(
    mapsQueryOf(listing),
    points.find((point) => point.label === distance.label),
    distance.mode,
  );
  if (url === null) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="ml-2 text-[0.85rem] whitespace-nowrap"
    >
      voir le trajet
    </a>
  );
}

export function ListingDetail({
  listing,
  profile,
  nowMs,
  onBack,
  onArchive,
  onFavorite,
  onTrackingChange,
  onContactRecorded,
  onOpenSource,
  onConfigureProfile,
}: ListingDetailProps): React.JSX.Element {
  const points = useReferencePoints();
  const archived = listing.archived === true;
  const favorite = listing.favorite === true;

  const mapsQuery = mapsQueryOf(listing);

  const place = formatPostalAddress({
    address: listing.address.value,
    postalCode: listing.postalCode.value,
    city: listing.city.value,
    district: listing.district.value,
  });

  return (
    <div>
      <header className="mb-2 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
        <span className="flex items-center gap-2">
          {listing.priceDropped === true && <Badge variant="good">Prix en baisse</Badge>}
          {!listing.matchesCriteria && <Badge variant="warning">Hors critères de recherche</Badge>}
          <DetailActions
            title={listing.title.value ?? 'Annonce Maïoun'}
            favorite={favorite}
            archived={archived}
            {...(onFavorite !== undefined ? { onFavorite } : {})}
            // Archivée par sa source (louée, retirée, candidatures fermées) : la
            // désarchiver n'aurait aucun effet, le bouton n'est pas proposé.
            {...(onArchive !== undefined && !isArchivedBySource(listing) ? { onArchive } : {})}
          />
        </span>
      </header>

      {/* AVANT LES PHOTOS ET LE PRIX : trop tard se dit d'emblée. */}
      <AvailabilityNotice listing={listing} />

      {/* Photos : affichées directement depuis le site d'origine (§11 : jamais
          téléchargées ni stockées). Le même carrousel que la carte de liste —
          flèches, points, une image à la fois — plutôt qu'un bandeau à faire
          glisser, dont rien n'indiquait qu'il continuait hors de l'écran.
          Quand aucune n'est affichable, `Photos` propose les liens. */}
      <Photos urls={listing.imageUrls} />

      <h1 className="mb-1 text-xl font-bold">{listing.title.value ?? 'Annonce sans titre'}</h1>

      <p className="mb-3 text-[1.05rem]">
        <strong>{formatPrice(listing.price.value)}</strong>
        <ConflictNote
          conflicts={listing.price.conflicts}
          render={(value) => formatPrice(value as number | null)}
        />
        <ChargesNote listing={listing} />
        <span aria-hidden="true"> · </span>
        {formatArea(listing.area.value)}
        <ConflictNote
          conflicts={listing.area.conflicts}
          render={(value) => formatArea(value as number | null)}
        />
        <span aria-hidden="true"> · </span>
        {formatRooms(listing.rooms.value)}
      </p>
      <EntryCosts listing={listing} />

      <TrackingSelect listing={listing} onChange={onTrackingChange} />

      <dl className={FACTS_GRID}>
        <dt className={FACT_LABEL}>Type</dt>
        <dd>{formatPropertyType(listing.propertyType.value)}</dd>

        <dt className={FACT_LABEL}>Meublé</dt>
        <dd>
          {listing.furnished.value === null ? UNKNOWN : listing.furnished.value ? 'Oui' : 'Non'}
        </dd>

        <dt className={FACT_LABEL}>Colocation</dt>
        <dd>
          {listing.flatShare?.value == null
            ? UNKNOWN
            : listing.flatShare.value
              ? 'Oui'
              : 'Non — logement entier'}
        </dd>

        {/* Publié par les meublés courte durée, et par eux seuls : on ne
          l'affiche donc que lorsqu'il existe (§17). */}
        {listing.maxOccupants?.value != null && (
          <>
            <dt className={FACT_LABEL}>Occupants</dt>
            <dd>
              {listing.maxOccupants.value} personne
              {listing.maxOccupants.value > 1 ? 's' : ''} maximum
            </dd>
          </>
        )}

        <dt className={FACT_LABEL}>DPE</dt>
        <dd>{classeOu(listing.dpe)}</dd>

        {/* Le GES vient du même diagnostic : même forme, juste en dessous. */}
        <dt className={FACT_LABEL}>GES</dt>
        <dd>{classeOu(listing.ges)}</dd>

        <dt className={FACT_LABEL}>Localisation</dt>
        <dd>
          {/* §20 : la localisation elle-même est le lien vers Maps — pas de
              lien « Ouvrir » séparé. */}
          {mapsQuery !== '' ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline"
              title="Ouvrir dans Maps"
            >
              <MapPin aria-hidden="true" className="inline size-4" /> {place}
            </a>
          ) : (
            <>
              {place}
              <span className="block text-[0.82rem] text-muted-foreground">
                La source ne publie ni rue ni quartier.
              </span>
            </>
          )}
        </dd>

        {/* §20 : distances vers des points de référence privés, libellés
          neutres. Elles vivaient dans une liste à part, dans un style qui leur
          était propre ; ce sont des faits sur le logement comme les autres. */}
        {listing.distances.map((distance) => (
          <Fragment key={distance.label}>
            <dt className={FACT_LABEL}>{distance.label}</dt>
            <dd>
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
              <DirectionsLink listing={listing} distance={distance} points={points} />
            </dd>
          </Fragment>
        ))}

        <dt className={FACT_LABEL}>Publiée</dt>
        <dd>{formatAge(listing.publishedAt.value, nowMs)}</dd>

        <dt className={FACT_LABEL}>Disponible</dt>
        <dd>
          {listing.availableAt.value === null
            ? UNKNOWN
            : new Date(listing.availableAt.value).toLocaleDateString('fr-FR')}
        </dd>

        <dt className={FACT_LABEL}>Vue pour la première fois</dt>
        <dd>{formatAge(listing.firstSeenAt, nowMs)}</dd>
      </dl>

      {/* Atouts extraits de l'annonce (§17 : uniquement ce qui est mentionné). */}
      {listing.features !== undefined && listing.features.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-1.5">
          {listing.features.map((feature) => (
            <li
              key={feature}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[0.8rem]"
            >
              {feature}
            </li>
          ))}
        </ul>
      )}

      {/* AVANT LE MESSAGE, PAS APRÈS. Savoir qu'on ne remplit pas les conditions
        change ce qu'on écrit — ou la décision d'écrire. Le découvrir sous le
        message déjà rédigé arrive trop tard. Ne s'affiche que si l'annonce
        énonce quelque chose, ce qui est rare. */}
      <RequirementsPanel listing={listing} profile={profile} />

      {/* Même raison, même place : ce qui change la décision se lit avant. */}
      <RiskAlert listing={listing} />

      {/* §22 : préparation du contact, en haut de page car c'est l'action utile. */}
      <ContactPanel
        listing={listing}
        profile={profile}
        onRecorded={onContactRecorded}
        onOpenSource={onOpenSource}
        onConfigureProfile={onConfigureProfile}
      />

      {/* `?.` et non `.` : une annonce venue de la liste n'a PAS de description
        — elle est retirée en SQL. La version complète arrive juste après, mais
        le rendu ne doit pas tomber entre les deux. */}
      {listing.description?.value != null && (
        <section className="mt-4">
          <h2 className="font-semibold">Description</h2>
          <p className="whitespace-pre-line break-words">
            {readableDescription(listing.description.value)}
          </p>
        </section>
      )}

      <div className="mt-4 sm:grid sm:grid-cols-2 sm:gap-3">
        <ScoreDetail title="Correspondance" score={listing.scores.match} />
        <ScoreDetail title="Urgence" score={listing.scores.opportunity} />
        <ScoreDetail
          title="Facilité de contact"
          score={listing.scores.visitProbability}
          caveat="Indice fondé sur des règles explicites, pas sur une statistique. Il sert à comparer les annonces entre elles, pas à prédire un pourcentage réel."
        />
        <ScoreDetail title="Signaux d’alerte" score={listing.scores.risk} invert />
      </div>
    </div>
  );
}
