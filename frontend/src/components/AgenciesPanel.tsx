/**
 * Annuaire des agences, et fiche d'une agence.
 *
 * LE NOM D'UNE AGENCE N'AVAIT RIEN DERRIÈRE. Il s'affichait sur une fiche
 * d'annonce et s'arrêtait là : impossible de savoir combien de biens elle
 * publiait, ni de retrouver son numéro sans rouvrir une annonce au hasard. Or
 * c'est une question qu'on se pose vraiment — une agence déjà appelée la
 * semaine dernière, un interlocuteur qui a trois biens dans le même quartier
 * et à qui l'on parlera une fois pour les trois.
 *
 * LE NOM SERT DE CLÉ, faute de mieux : les sources ne publient pas
 * d'identifiant d'agence. Deux orthographes donnent donc deux LIGNES — c'est
 * préférable à un regroupement inventé qui mélangerait deux enseignes, et la
 * fiche d'une agence s'ouvre par son nom exact.
 *
 * LES COMPTES, EUX, NE S'EN CONTENTENT PLUS. « Non suivies (264) » comptait
 * des graphies, et surtout comptait la mauvaise chose : il répondait « cette
 * annonce-ci est-elle venue du site de l'agence ? » quand la question posée
 * était « collectons-nous cette agence ? ». Voir `agency-coverage.ts`.
 */

import { ArrowLeft, Mail, MapPin, Phone } from './icons.js';
import { AgencyLogo, agencyAddress } from './AgencyLogo.js';
import type { AgencySummary } from '../api/client.js';
import type { ListingView } from '../types.js';
import { formatSourceName } from '../format.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { ItemButton, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { ListingCard } from './ListingCard.js';
import { useState } from 'react';
import { hasParserGap, isFollowedAgency } from '../agency-coverage.js';
import { ToggleGroup } from '@/components/ui/toggle.js';

/** Coordonnées d'une agence : ce dont on se sert pour la joindre. */
function AgencyContact({ agency }: { readonly agency: AgencySummary }): React.JSX.Element | null {
  const address = agencyAddress(agency.name);
  if (agency.phone === null && agency.email === null && address === null) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.9rem]">
      {address !== null && (
        <span className="text-muted-foreground inline-flex basis-full items-center gap-1.5 text-[0.82rem]">
          <MapPin aria-hidden="true" className="size-4 shrink-0" /> {address}
        </span>
      )}
      {agency.phone !== null && (
        <a href={`tel:${agency.phone}`} className="text-primary inline-flex items-center gap-1.5">
          <Phone aria-hidden="true" className="size-4" /> {agency.phone}
        </a>
      )}
      {agency.email !== null && (
        <a
          href={`mailto:${agency.email}`}
          className="text-primary inline-flex min-w-0 items-center gap-1.5"
        >
          <Mail aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{agency.email}</span>
        </a>
      )}
    </div>
  );
}

export function AgenciesPanel({
  agencies,
  onBack,
  onOpen,
}: {
  readonly agencies: readonly AgencySummary[];
  readonly onBack: () => void;
  readonly onOpen: (name: string) => void;
}): React.JSX.Element {
  const [show, setShow] = useState<'all' | 'unfollowed' | 'gap'>('all');
  // DEUX MANQUES DISTINCTS, ET SURTOUT PAS MÉLANGÉS : il manque une SOURCE, ou
  // il manque une ANNONCE à une source qui existe. Le premier se répare en
  // ajoutant une agence, le second en reprenant un parseur.
  const unfollowed = agencies.filter((agency) => !isFollowedAgency(agency.name));
  const gap = agencies.filter((agency) => hasParserGap(agency.name, agency.sources));
  const shown = show === 'all' ? agencies : show === 'unfollowed' ? unfollowed : gap;
  return (
    <div>
      <header className="mb-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
      </header>

      <h1 className="mb-1 text-xl font-bold">Agences</h1>
      <p className="text-muted-foreground mb-3 text-[0.9rem]">
        Celles qui publient les annonces trouvées, classées par nombre de biens en ligne.
      </p>
      {/* LES DEUX LISTES À SURVEILLER. Tenues à jour par chaque collecte. */}
      <ToggleGroup
        aria-label="Agences affichées"
        className="mb-2"
        value={show}
        onValueChange={setShow}
        items={[
          { value: 'all', label: `Toutes (${agencies.length})` },
          { value: 'unfollowed', label: `Sans source (${unfollowed.length})` },
          { value: 'gap', label: `Annonce manquée (${gap.length})` },
        ]}
      />
      {show === 'unfollowed' && (
        <p className="text-muted-foreground mb-3 text-[0.82rem]">
          Aucune source ne les collecte : leurs biens n’arrivent qu’avec le retard et les manques du
          portail qui les relaie.
        </p>
      )}
      {show === 'gap' && (
        <p className="text-muted-foreground mb-3 text-[0.82rem]">
          Nous lisons leur site, mais cette annonce-là n’y a pas été vue : elle n’est arrivée que
          par un portail. C’est un parseur à reprendre, pas une source à ajouter.
        </p>
      )}

      {shown.length === 0 ? (
        <Card className="text-muted-foreground py-8 text-center text-[0.92rem]">
          Aucune agence identifiée pour l’instant.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((agency, rank) => (
            <li key={agency.name}>
              <ItemButton
                onClick={() => onOpen(agency.name)}
                className="rf-rise"
                style={{ '--rf-delay': `${Math.min(rank, 10) * 25}ms` } as React.CSSProperties}
              >
                <AgencyLogo name={agency.name} className="size-6" />
                <ItemContent>
                  <ItemTitle className="truncate">{agency.name}</ItemTitle>
                  <ItemDescription className="text-[0.8rem]">
                    {agency.sources.map(formatSourceName).join(', ')}
                  </ItemDescription>
                </ItemContent>
                <span className="shrink-0 text-right">
                  <span className="block leading-none font-bold">{agency.listings}</span>
                  <span className="text-muted-foreground text-[0.7rem]">
                    annonce{agency.listings > 1 ? 's' : ''}
                  </span>
                </span>
              </ItemButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgencyPanel({
  agency,
  listings,
  nowMs,
  onBack,
  onOpenListing,
  onFavorite,
}: {
  readonly agency: AgencySummary;
  readonly listings: readonly ListingView[];
  readonly nowMs: number;
  readonly onBack: () => void;
  readonly onOpenListing: (id: string) => void;
  readonly onFavorite: (id: string, favorite: boolean) => void;
}): React.JSX.Element {
  return (
    <div>
      <header className="mb-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
      </header>

      {/* Le logo accompagne le nom sur la fiche aussi : c'est le même repère,
        et son absence ici donnerait l'impression d'une autre agence. */}
      <div className="flex items-center gap-3">
        <AgencyLogo name={agency.name} className="size-9" />
        <h1 className="min-w-0 flex-1 text-xl font-bold">{agency.name}</h1>
      </div>
      <p className="text-muted-foreground text-[0.9rem]">
        {agency.listings} annonce{agency.listings > 1 ? 's' : ''} en ligne
        {agency.sources.length > 0 && <> · {agency.sources.map(formatSourceName).join(', ')}</>}
      </p>
      <AgencyContact agency={agency} />

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {listings.map((listing, rank) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            nowMs={nowMs}
            rank={rank}
            onOpen={() => onOpenListing(listing.id)}
            onFavorite={(favorite) => onFavorite(listing.id, favorite)}
          />
        ))}
      </div>
    </div>
  );
}
