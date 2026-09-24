/**
 * Les alertes des portails, par transfert d'e-mail (§6, §26) — écran Paramètres.
 *
 * POURQUOI CET ÉCRAN EXISTE. Leboncoin, SeLoger et Bien'ici interdisent qu'on
 * visite leurs pages (§10). Leur seule voie conforme est celle qu'ils offrent
 * eux-mêmes : l'alerte par e-mail. Encore faut-il que ces e-mails nous
 * parviennent.
 *
 * ILS N'ARRIVAIENT QU'À UN SEUL COMPTE, et pour une raison de fond : le
 * collecteur lisait UNE boîte, celle dont le mot de passe d'application est
 * dans son environnement. Ouvrir cela à chaque compte aurait voulu dire ranger
 * en base le mot de passe de la boîte personnelle de chacun (§26 l'interdit).
 *
 * Le transfert renverse la charge : chaque compte reçoit une adresse qui n'est
 * qu'à lui, et pose lui-même une règle dans SA boîte. Il ne nous confie aucun
 * identifiant, et retire la règle quand il veut. C'est aussi la seule voie qui
 * marche partout — laposte.net, Orange et Free n'offrent aucun OAuth.
 *
 * L'ÉCRAN NE PROMET RIEN QU'IL NE PUISSE TENIR. Sans adresse configurée, il le
 * dit au lieu d'en inventer une : une règle de transfert vers le vide
 * n'échouerait jamais bruyamment, et l'utilisateur attendrait pour rien (§17).
 *
 * IL DIT AUSSI CE QUI EST ARRIVÉ. Une règle mal filtrée ne produit aucune
 * erreur, seulement du silence — le même silence qu'une journée sans nouvelle
 * annonce. Le compte pouvait attendre des semaines sans savoir lequel des deux
 * il vivait. « Dernière alerte reçue » tranche.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAlertAddress,
  fetchFilters,
  rotateAlertAddress,
  type AlertForwarding,
} from '../api/client.js';
import type { FilterConfig } from '../types.js';
import { formatAge } from '../format.js';
import { portalMissesCity, portalSearchUrl, type PortalId } from '../portal-search.js';
import { Button, ButtonLink } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { ConfirmDialog } from '@/components/ui/dialog.js';
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import { Check, Copy, ExternalLink, Mail } from './icons.js';
import { PanelSkeleton } from './Skeletons.js';
import { EchecDeChargement } from './EchecDeChargement.js';

interface Portal {
  readonly id: PortalId;
  readonly label: string;
  /** Le libellé du bouton chez eux, pour qu'on le reconnaisse du premier coup. */
  readonly action: string;
}

const PORTALS: readonly Portal[] = [
  { id: 'leboncoin', label: 'Leboncoin', action: 'Sauvegarder la recherche' },
  { id: 'seloger', label: 'SeLoger', action: 'Créer une alerte' },
  { id: 'bienici', label: 'Bien’ici', action: 'Créer une alerte' },
];

/**
 * Un portail, trois gestes : ouvrir sa recherche déjà filtrée, y créer
 * l'alerte, lui donner l'adresse. Refaire ses critères chez chacun était la
 * vraie longueur de la mise en place.
 */
function PortalCard({
  portal,
  criteria,
  copied,
  onCopy,
}: {
  readonly portal: Portal;
  readonly criteria: FilterConfig | null;
  readonly copied: boolean;
  readonly onCopy: () => void;
}): React.JSX.Element {
  const url = portalSearchUrl(portal.id, criteria ?? { cities: [], maxPrice: 0, minArea: 0 });
  const missesCity = criteria !== null && portalMissesCity(portal.id, criteria);
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="font-semibold">{portal.label}</h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-[0.88rem]">
        <li>
          Ouvrez la recherche : vos critères y sont déjà
          {missesCity ? ' — vérifiez la ville, elle n’a pas pu être posée' : ''}.
        </li>
        <li>Cliquez « {portal.action} ».</li>
        <li>Donnez l’adresse copiée comme e-mail de réception.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={url} target="_blank" rel="noopener noreferrer" size="sm">
          <ExternalLink aria-hidden="true" className="size-4" />
          Ouvrir {portal.label}
        </ButtonLink>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Copier l’adresse pour ${portal.label}`}
          onClick={onCopy}
        >
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? 'Copiée' : 'Copier l’adresse'}
        </Button>
      </div>
    </Card>
  );
}

function Steps({
  criteria,
  copied,
  onCopy,
}: {
  readonly criteria: FilterConfig | null;
  readonly copied: string | null;
  readonly onCopy: (from: string) => void;
}): React.JSX.Element {
  return (
    <>
      <div className="mt-4 flex flex-col gap-3">
        {PORTALS.map((portal) => (
          <PortalCard
            key={portal.id}
            portal={portal}
            criteria={criteria}
            copied={copied === portal.id}
            onCopy={() => onCopy(portal.id)}
          />
        ))}
      </div>

      <Collapsible className="text-muted-foreground mt-3 text-[0.85rem]">
        <CollapsibleTrigger>Vos alertes existent déjà ?</CollapsibleTrigger>
        <p className="mt-1.5">
          Dans votre boîte mail, ajoutez une règle qui fait suivre ces portails vers l’adresse
          ci-dessus — cherchez « filtres » ou « règles ».
        </p>
      </Collapsible>
    </>
  );
}

/** Le compte est la boîte lue : ses alertes entrent déjà, sans rien faire. */
function NothingToDo(): React.JSX.Element {
  return (
    <div className="border-good/40 bg-good/10 mt-4 rounded-xl border p-3 text-[0.9rem]">
      <p className="font-medium">Rien à faire : vos alertes arrivent déjà.</p>
      <p className="text-muted-foreground mt-1">
        La collecte lit votre boîte directement. L’adresse ci-dessous ne sert qu’à un autre compte.
      </p>
    </div>
  );
}

/**
 * Ce que le transfert a apporté, ou l'aveu qu'il n'a rien apporté.
 *
 * Le compte a posé une règle dans sa boîte et n'avait aucun retour. Le nombre
 * compte autant que la date : « 12 annonces » dit que la règle attrape la
 * bonne chose, là où une date seule pourrait n'être qu'un message isolé.
 */
function Reception({ state }: { state: AlertForwarding }): React.JSX.Element | null {
  if (state.lastReceivedAt === null) {
    // RIEN À DIRE quand le compte est lui-même la boîte lue : « aucune alerte
    // reçue sur cette adresse » est vrai du sous-adressage et faux de ce qui
    // compte — ses alertes entrent, simplement pas par là.
    if (state.ownMailbox) return null;
    return (
      <p className="text-muted-foreground mt-2 text-[0.82rem]">
        Aucune alerte reçue sur cette adresse pour l’instant.
      </p>
    );
  }
  return (
    <p className="mt-2 text-[0.82rem]">
      <Check aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
      Dernière alerte reçue {formatAge(state.lastReceivedAt, Date.now())} — {state.receivedCount}{' '}
      annonce
      {state.receivedCount > 1 ? 's' : ''} apportée{state.receivedCount > 1 ? 's' : ''} en tout.
    </p>
  );
}

export function ForwardingSection(): React.JSX.Element {
  const [state, setState] = useState<AlertForwarding | null | undefined>(undefined);
  /** D'où vient la dernière copie : l'accusé s'affiche sur le bouton cliqué. */
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [criteria, setCriteria] = useState<FilterConfig | null>(null);
  const address = state?.address ?? null;

  // `null` veut dire ÉCHEC, pas « rien à montrer ». Les deux s'affichaient
  // pareil — « fonctionnalité non configurée » —, si bien qu'une coupure
  // réseau passait pour une décision d'installation, et qu'on ne pensait pas
  // à réessayer.
  const charger = useCallback(() => {
    setState(undefined);
    void fetchAlertAddress()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  useEffect(() => {
    charger();
    // Sans critères, les liens ouvrent une recherche vierge : moins utile,
    // jamais cassé. Rien à signaler.
    void fetchFilters()
      .then(setCriteria)
      .catch(() => undefined);
  }, [charger]);

  const rotate = (): void => {
    setRotating(true);
    void rotateAlertAddress()
      .then(setState)
      .catch(() => {
        /* L'ancienne adresse reste affichée : elle est encore la bonne. */
      })
      .finally(() => {
        setRotating(false);
        setConfirming(false);
      });
  };

  const copy = (from: string): void => {
    if (address === null) return;
    void navigator.clipboard
      ?.writeText(address)
      .then(() => {
        setCopied(from);
        window.setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => {
        /* Presse-papiers refusé : l'adresse reste sélectionnable à la main. */
      });
  };

  return (
    <div>
      <p className="text-muted-foreground mt-1 text-[0.88rem]">
        Ces portails n’autorisent que leur propre alerte par e-mail. Voici où l’envoyer.
      </p>

      {state === undefined && <PanelSkeleton rows={2} />}

      {state === null && <EchecDeChargement quoi="votre adresse d’alertes" onReessayer={charger} />}

      {state !== undefined && state !== null && address === null && (
        <p className="border-border mt-4 rounded-xl border p-3 text-[0.9rem]">
          Fonctionnalité non configurée sur cette installation : aucune adresse ne vous est
          attribuée.
        </p>
      )}

      {state !== undefined && state !== null && address !== null && (
        <>
          {state.ownMailbox && <NothingToDo />}

          <div className="border-border bg-card mt-4 flex items-center gap-2 rounded-xl border p-3">
            <Mail aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
            {/* `select-all` : l'adresse se recopie d'un geste même quand le
              presse-papiers est refusé par le navigateur. */}
            <code className="min-w-0 flex-1 select-all font-mono text-[0.85rem] break-all">
              {address}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={() => copy('address')}>
              {copied === 'address' ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              {copied === 'address' ? 'Copiée' : 'Copier'}
            </Button>
          </div>
          <Reception state={state} />

          <p className="text-muted-foreground mt-2 text-[0.82rem]">
            Cette adresse n’est qu’à vous. Ne la publiez pas.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setConfirming(true)}
          >
            Changer d’adresse
          </Button>

          {!state.ownMailbox && <Steps criteria={criteria} copied={copied} onCopy={copy} />}

          <ConfirmDialog
            open={confirming}
            title="Changer d’adresse de transfert ?"
            description={
              <>
                L’adresse actuelle cessera <strong>immédiatement</strong> de fonctionner. Les
                alertes qui y arriveront ensuite seront perdues : pensez à mettre à jour la règle de
                transfert dans votre boîte mail avec la nouvelle adresse.
              </>
            }
            confirmLabel="Changer d’adresse"
            confirmDisabled={rotating}
            onConfirm={rotate}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </div>
  );
}
