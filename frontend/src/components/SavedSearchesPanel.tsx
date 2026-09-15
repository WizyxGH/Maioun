/**
 * Recherches enregistrées.
 *
 * On règle sept champs, on trouve ce qu'on cherche, et le lendemain il faut
 * tout recommencer : rien ne gardait le jeu complet. Cette page le garde, et
 * le rappelle d'un geste.
 *
 * TOUT LE CYCLE VIT ICI. Enregistrer se faisait depuis la modale « Trier et
 * filtrer » — un troisième verbe dans un pied qui en portait déjà deux —, et
 * renommer ne se faisait nulle part : une recherche mal nommée se supprimait et
 * se refaisait. Créer, rappeler, renommer, supprimer sont maintenant au même
 * endroit, celui dont c'est le sujet.
 *
 * LA CARTE DIT D'ABORD CE QUI CHANGE. Le nom, puis le nombre d'annonces en
 * évidence — c'est lui qu'on parcourt pour savoir laquelle rouvrir —, puis les
 * critères en petit. L'ordre inverse obligeait à lire une ligne de réglages
 * pour retrouver une recherche qu'on reconnaît à son nom.
 */

import { useEffect, useId, useState } from 'react';
import { convertEstimatedDuration, type ReferenceTravelMode } from '@maioun/shared';
import {
  ArrowLeft,
  Check,
  Copy,
  MapPin,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from './icons.js';
import type { SavedSearch } from '../saved-searches.js';
import type { FilterConfig } from '../types.js';
import { SearchSummary } from './SearchSummary.js';
import { AddressField } from './AddressField.js';
import { formatAge } from '../format.js';
import { hrefOf } from '../router.js';
import { encodeSearch } from '../share-search.js';
import {
  fetchReferencePoints,
  saveReferencePoints,
  type StoredReferencePoint,
} from '../api/client.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';

const MODE_LABELS: Readonly<Record<ReferenceTravelMode, string>> = {
  walking: 'à pied',
  cycling: 'à vélo',
  transit: 'en bus ou tram',
  train: 'en train',
  driving: 'en voiture',
};

/** 16 px sur mobile : en dessous, iOS zoome à la mise au point. */
const FIELD = 'w-full px-3 text-base sm:text-sm';

interface SavedSearchesPanelProps {
  readonly searches: readonly SavedSearch[];
  readonly nowMs: number;
  /** Nombre d'annonces chargées que chaque recherche laisserait passer. */
  readonly countFor: (search: SavedSearch) => number;
  readonly onBack: () => void;
  readonly onApply: (search: SavedSearch) => void;
  readonly onDelete: (id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  /**
   * Remplace les réglages de la recherche par ceux de l'écran, nom gardé.
   *
   * C'est le geste qui manquait : sans lui, corriger une borne de loyer
   * imposait de réenregistrer — donc d'obtenir deux cartes du même nom — puis
   * de supprimer la bonne des deux.
   */
  readonly onUpdate: (id: string) => void;
  /**
   * Ouvre les réglages de CETTE recherche, pour les corriger sur place.
   *
   * « Mettre à jour avec les filtres actuels » suppose qu'on soit déjà allé
   * régler l'écran de recherche : quatre écrans pour corriger une borne de
   * loyer, dont trois qui ne servent qu'à retrouver son chemin. Celui-ci mène
   * directement aux critères de la recherche, et les y renvoie.
   */
  readonly onEdit: (search: SavedSearch) => void;
  /**
   * Remplace les critères de collecte de la recherche, sans passer par l'écran
   * de recherche : c'est ce qu'écrit l'éditeur de trajet de la carte.
   */
  readonly onUpdateCriteria: (id: string, criteria: FilterConfig) => void;
  /** Enregistre l'état courant de la recherche sous le nom donné. */
  readonly onSaveCurrent: (name: string) => void;
  /** Nom proposé pour l'état courant, calculé à partir des réglages actifs. */
  readonly suggestion: string;
  /**
   * `false` quand l'accès courant n'a pas de base où écrire (démo) : on
   * l'explique au lieu de proposer un bouton qui n'enregistrerait rien.
   */
  readonly available: boolean;
}

/**
 * Saisie d'un nom, en ligne. Le même geste sert à créer et à renommer : dans
 * les deux cas on part d'un nom déjà rempli, qu'il n'y a qu'à valider.
 */
function NameForm({
  initial,
  label,
  onConfirm,
  onCancel,
}: {
  readonly initial: string;
  readonly label: string;
  readonly onConfirm: (name: string) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex min-w-0 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed !== '') onConfirm(trimmed);
      }}
    >
      <Input
        size="sm"
        type="text"
        value={name}
        autoFocus
        aria-label={label}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
        // 16 px sur mobile : en dessous, iOS zoome à la mise au point.
        className="min-w-0 flex-1 px-3 text-base sm:text-sm"
      />
      <Button size="sm" type="submit">
        Valider
      </Button>
      <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
        Annuler
      </Button>
    </form>
  );
}

/**
 * L'adresse de référence, avec la mention qui évite le malentendu.
 *
 * Les trajets se calculent à la collecte depuis les repères DU COMPTE, pas
 * depuis chaque recherche : changer l'adresse ici la change pour toutes.
 * Le taire ferait croire à deux recherches vers deux lieux de travail.
 */
function ReferenceAddressInput({
  value,
  onChange,
  label,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.85rem] font-medium">Adresse de référence (trajet)</span>
      <AddressField
        className={FIELD}
        value={value}
        ariaLabel={label}
        placeholder="12 rue de la République, 06300 Nice"
        onChange={onChange}
      />
      <span className="text-muted-foreground text-[0.75rem]">
        Commune à toutes vos recherches. Les trajets sont recalculés à la prochaine collecte.
      </span>
    </div>
  );
}

/**
 * Création : le nom ET l'adresse de référence, dans le même geste.
 *
 * Régler l'adresse obligeait à quitter la page pour les Paramètres, puis à
 * revenir enregistrer : on créait souvent la recherche d'abord, sans trajet.
 */
function CreateForm({
  suggestion,
  initialAddress,
  onConfirm,
  onCancel,
}: {
  readonly suggestion: string;
  readonly initialAddress: string;
  readonly onConfirm: (name: string, address: string) => Promise<void>;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(suggestion);
  const [address, setAddress] = useState(initialAddress);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (trimmed === '' || busy) return;
          setBusy(true);
          void onConfirm(trimmed, address).finally(() => setBusy(false));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.85rem] font-medium">Nom</span>
          <Input
            size="sm"
            type="text"
            value={name}
            autoFocus
            aria-label="Nom de la recherche"
            onChange={(event) => setName(event.target.value)}
            className={FIELD}
          />
        </label>
        <ReferenceAddressInput
          value={address}
          onChange={setAddress}
          label="Adresse de référence de la nouvelle recherche"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="submit" disabled={busy}>
            Enregistrer
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Modification du trajet d'une recherche : adresse et durée maximale.
 *
 * La durée se lit dans le mode choisi pour la recherche, comme dans les
 * filtres ; elle est stockée dans celui du repère, où la collecte la compare.
 */
function CommuteForm({
  search,
  reference,
  onConfirm,
  onCancel,
}: {
  readonly search: SavedSearch;
  readonly reference: StoredReferencePoint | null;
  readonly onConfirm: (address: string, criteria: FilterConfig) => Promise<void>;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const minutesId = useId();
  const storedMode = reference?.mode ?? 'transit';
  const shownMode = search.criteria.commuteMode ?? storedMode;
  const stored = search.criteria.maxCommuteMinutes;
  const [address, setAddress] = useState(reference?.address ?? '');
  const [minutes, setMinutes] = useState(
    stored === undefined ? '' : String(convertEstimatedDuration(stored, storedMode, shownMode)),
  );
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    if (busy) return;
    const { maxCommuteMinutes: _dropped, ...rest } = search.criteria;
    const typed = Number(minutes);
    // Vide ou nul : plus de plafond de trajet, comme dans les filtres.
    const criteria: FilterConfig =
      minutes.trim() === '' || !Number.isFinite(typed) || typed <= 0
        ? rest
        : { ...rest, maxCommuteMinutes: convertEstimatedDuration(typed, shownMode, storedMode) };
    setBusy(true);
    void onConfirm(address, criteria).finally(() => setBusy(false));
  };

  return (
    <form
      className="border-border mt-3 flex flex-col gap-3 rounded-xl border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <ReferenceAddressInput
        value={address}
        onChange={setAddress}
        label={`Adresse de référence de « ${search.name} »`}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={minutesId} className="text-[0.85rem] font-medium">
          Trajet max {MODE_LABELS[shownMode]}
        </label>
        <span className="flex items-center gap-1.5">
          <Input
            id={minutesId}
            size="sm"
            type="number"
            inputMode="numeric"
            min={0}
            value={minutes}
            placeholder="Sans limite"
            onChange={(event) => setMinutes(event.target.value)}
            className="w-28 px-3 text-base sm:text-sm"
          />
          <span className="text-muted-foreground text-[0.8rem]">min</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export function SavedSearchesPanel({
  searches,
  nowMs,
  countFor,
  onBack,
  onApply,
  onDelete,
  onRename,
  onUpdate,
  onEdit,
  onUpdateCriteria,
  onSaveCurrent,
  suggestion,
  available,
}: SavedSearchesPanelProps): React.JSX.Element {
  /** Les repères du compte ; le premier est celui d'où se comptent les trajets. */
  const [points, setPoints] = useState<readonly StoredReferencePoint[] | null>(null);
  const [commuting, setCommuting] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  useEffect(() => {
    if (!available) return;
    void fetchReferencePoints()
      .then(setPoints)
      .catch(() => setPoints(null));
  }, [available]);

  const reference = points?.[0] ?? null;

  /**
   * Écrit l'adresse dans le premier repère, les autres gardés tels quels.
   *
   * Sans repère encore, on crée « Travail » : c'est ce que la page Paramètres
   * propose d'emblée, et le trajet domicile→travail ce que mesure le critère.
   */
  const saveAddress = async (address: string): Promise<boolean> => {
    const trimmed = address.trim();
    if (trimmed === '' || trimmed === reference?.address) return true;
    const current = points ?? [];
    const first = current[0];
    const next: StoredReferencePoint[] =
      first === undefined
        ? [{ label: 'Travail', address: trimmed, mode: 'transit' }]
        : [{ ...first, address: trimmed }, ...current.slice(1)];
    try {
      await saveReferencePoints(next);
      setPoints(next);
      setReferenceError(null);
      return true;
    } catch {
      setReferenceError('L’adresse de référence n’a pas pu être enregistrée');
      return false;
    }
  };
  // Suppression en deux temps : une recherche patiemment réglée ne doit pas
  // disparaître sur un doigt qui glisse.
  const [confirming, setConfirming] = useState<string | null>(null);
  /**
   * Mise à jour en deux temps, POUR LA MÊME RAISON QUE LA SUPPRESSION : elle
   * écrase des réglages qu'on ne retrouvera pas. La différence est qu'elle n'en
   * a pas l'air — un bouton qui « met à jour » se clique sans y penser.
   */
  const [replacing, setReplacing] = useState<string | null>(null);
  /**
   * La recherche qui vient d'être mise à jour, le temps d'un accusé.
   *
   * SANS LUI, LE BOUTON PASSE POUR MORT — et c'est ce qui a été signalé. Rien
   * ne bouge après un remplacement : ni le nom, ni le compteur, et la
   * description ne change que si les filtres courants diffèrent de ceux
   * enregistrés. Or on met souvent à jour juste après avoir rejoué la
   * recherche, donc sans écart visible. Le geste est le même que pour le
   * partage, qui souffrait du même mal.
   */
  const [replaced, setReplaced] = useState<string | null>(null);
  /**
   * La recherche dont le lien vient d'être copié, le temps d'un accusé.
   *
   * SANS RETOUR VISIBLE, un « copier » ne se distingue pas d'un bouton mort :
   * rien ne bouge à l'écran, et l'on reclique.
   */
  const [copied, setCopied] = useState<string | null>(null);

  /**
   * Copie le lien de partage dans le presse-papiers.
   *
   * `navigator.share` EST PRÉFÉRÉ QUAND IL EXISTE — sur téléphone, il ouvre le
   * partage du système, d'où le lien part vers un message en un geste. Ailleurs
   * on retombe sur le presse-papiers, et l'accusé dit que c'est fait.
   */
  const share = async (search: SavedSearch): Promise<void> => {
    const url = `${window.location.origin}${hrefOf({ view: 'shared', id: encodeSearch(search) })}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: search.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(search.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Partage annulé, presse-papiers refusé : rien à signaler, l'utilisateur
      // vient de fermer la fenêtre qu'il a ouverte (§69).
    }
  };

  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <header className="mb-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
      </header>

      <h1 className="mb-4 text-xl font-bold">Recherches enregistrées</h1>

      {!available ? (
        <p className="text-muted-foreground">
          Cet accès n’a pas de base où conserver une recherche. Connectez-vous à vos données pour en
          enregistrer.
        </p>
      ) : (
        <>
          {/* CRÉER EST LA PREMIÈRE CHOSE QU'ON VOIT. La page servait à rappeler
            une recherche mais pas à en faire une : il fallait ressortir, régler
            la modale, et y trouver un bouton perdu entre deux autres. */}
          {referenceError !== null && (
            <p role="alert" className="text-bad mb-3 text-[0.85rem]">
              {referenceError}
            </p>
          )}
          <div className="mb-4">
            {creating ? (
              <CreateForm
                suggestion={suggestion}
                initialAddress={reference?.address ?? ''}
                onConfirm={async (name, address) => {
                  if (!(await saveAddress(address))) return;
                  onSaveCurrent(name);
                  setCreating(false);
                }}
                onCancel={() => setCreating(false)}
              />
            ) : (
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Enregistrer la recherche actuelle
              </Button>
            )}
          </div>

          {searches.length === 0 ? (
            <Card className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
              <Search aria-hidden="true" className="size-6" />
              <p className="max-w-xs text-[0.92rem]">
                Aucune recherche enregistrée. Réglez vos filtres depuis la recherche, puis revenez
                ici pour garder ce jeu de critères.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {searches.map((search, rank) => {
                const count = countFor(search);
                return (
                  <li key={search.id}>
                    <Card
                      className="rf-rise"
                      style={
                        { '--rf-delay': `${Math.min(rank, 10) * 30}ms` } as React.CSSProperties
                      }
                    >
                      {renaming === search.id ? (
                        <NameForm
                          initial={search.name}
                          label={`Nouveau nom de « ${search.name} »`}
                          onConfirm={(name) => {
                            onRename(search.id, name);
                            setRenaming(null);
                          }}
                          onCancel={() => setRenaming(null)}
                        />
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <strong className="min-w-0 flex-1 truncate text-[1.05rem]">
                              {search.name}
                            </strong>
                            <span className="shrink-0 text-right">
                              <span className="block text-lg leading-none font-bold">{count}</span>
                              <span className="text-muted-foreground text-[0.7rem]">
                                annonce{count > 1 ? 's' : ''}
                              </span>
                            </span>
                          </div>
                          <SearchSummary search={search} className="mt-1.5 text-[0.85rem]" />
                          {reference !== null && (
                            <p className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1 text-[0.78rem]">
                              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                              <span className="truncate">Trajet depuis {reference.address}</span>
                            </p>
                          )}
                          <p className="text-muted-foreground mt-0.5 text-[0.78rem]">
                            Enregistrée {formatAge(search.createdAt, nowMs)}
                          </p>
                        </>
                      )}

                      {commuting === search.id && (
                        <CommuteForm
                          search={search}
                          reference={reference}
                          onConfirm={async (address, criteria) => {
                            if (!(await saveAddress(address))) return;
                            onUpdateCriteria(search.id, criteria);
                            setCommuting(null);
                          }}
                          onCancel={() => setCommuting(null)}
                        />
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-1">
                        <Button size="sm" onClick={() => onApply(search)}>
                          <Play aria-hidden="true" className="size-4" /> Lancer
                        </Button>
                        {confirming === search.id ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onDelete(search.id);
                                setConfirming(null);
                              }}
                            >
                              Confirmer
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                              Annuler
                            </Button>
                          </>
                        ) : replaced === search.id ? (
                          <span className="text-good inline-flex items-center gap-1.5 text-[0.85rem] font-medium">
                            <Check aria-hidden="true" className="size-4" />
                            Réglages remplacés
                          </span>
                        ) : replacing === search.id ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onUpdate(search.id);
                                setReplacing(null);
                                setReplaced(search.id);
                                window.setTimeout(() => setReplaced(null), 2500);
                              }}
                            >
                              Remplacer les réglages
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setReplacing(null)}>
                              Annuler
                            </Button>
                          </>
                        ) : (
                          <>
                            {/* METTRE À JOUR AVEC L'ÉCRAN COURANT. Le nom et la
                              date de création restent : ce qu'on corrige, c'est
                              un budget ou une surface, pas l'identité de la
                              recherche. */}
                            {/* MODIFIER LES CRITÈRES, SUR PLACE. Le geste
                              qu'on cherche en arrivant ici, et qui n'existait
                              pas : il ouvre les réglages DE CETTE recherche. */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto"
                              aria-label={`Modifier les critères de « ${search.name} »`}
                              onClick={() => onEdit(search)}
                            >
                              <SlidersHorizontal aria-hidden="true" className="size-4" />
                            </Button>
                            {/* L'ADRESSE DE RÉFÉRENCE SE RÈGLE ICI, sans quitter
                              la page : les réglages ouvraient l'écran de
                              recherche, qui ne la montre même pas. */}
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Adresse de référence de « ${search.name} »`}
                              aria-expanded={commuting === search.id}
                              onClick={() =>
                                setCommuting((current) =>
                                  current === search.id ? null : search.id,
                                )
                              }
                            >
                              <MapPin aria-hidden="true" className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Mettre à jour « ${search.name} » avec les filtres actuels`}
                              onClick={() => setReplacing(search.id)}
                            >
                              <Upload aria-hidden="true" className="size-4" />
                            </Button>
                            {/* PARTAGER, C'EST COPIER UN LIEN. Le lien porte la
                              recherche elle-même, encodée : rien n'est écrit
                              en base, et il continue de fonctionner sans
                              nous. */}
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Partager « ${search.name} »`}
                              onClick={() => void share(search)}
                            >
                              {copied === search.id ? (
                                <Check aria-hidden="true" className="size-4" />
                              ) : (
                                <Copy aria-hidden="true" className="size-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Renommer « ${search.name} »`}
                              onClick={() => setRenaming(search.id)}
                            >
                              <Pencil aria-hidden="true" className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Supprimer « ${search.name} »`}
                              onClick={() => setConfirming(search.id)}
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
