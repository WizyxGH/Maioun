/**
 * État des sources (§63).
 *
 * Petite page d'observabilité : elle répond à « pourquoi n'ai-je pas de
 * nouvelles annonces ? » sans avoir à ouvrir les logs GitHub Actions.
 *
 * Elle n'affiche que des métadonnées d'exécution — aucune donnée personnelle.
 */

import { useState } from 'react';
import { comparable } from '@maioun/shared';
import { SOURCES } from '../sources.generated.js';
import type { SourceStateView } from '../types.js';
import { formatAge, formatSourceHealth, formatSourceName, sourceHealthBorder } from '../format.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { ArrowLeft } from './icons.js';

/**
 * Ce que la dernière raison d'arrêt veut dire, en français.
 *
 * L'écran n'affichait que l'état de santé. « Dégradée » ne dit pas s'il faut
 * réparer un parseur, attendre un déblocage, ou ne rien faire du tout parce que
 * l'agence n'a plus rien à louer — et c'est pourtant toute la question.
 */
const STOP_LABELS: Record<string, string> = {
  completed: 'inventaire lu en entier',
  knownTerritory: 'arrêt sur territoire connu',
  maxPages: 'budget de pages atteint',
  maxListings: 'plafond d’annonces atteint',
  rateLimited: 'trop de requêtes (429)',
  tooManyErrors: 'trop d’erreurs',
  blocked: 'accès refusé',
  notModified: 'page inchangée',
  incomplete: 'inventaire lu en partie',
  empty: 'la source annonce n’avoir aucun bien',
};

/** Singulier, pluriel. */
const SUMMARY_LABELS: Record<SourceStateView['health'], readonly [string, string]> = {
  healthy: ['OK', 'OK'],
  degraded: ['dégradée', 'dégradées'],
  cooldown: ['en repos', 'en repos'],
  disabled: ['désactivée', 'désactivées'],
  blocked: ['bloquée', 'bloquées'],
};

/** « 133 sources · 128 OK · 5 dégradées » : le compte, puis ce qui demande un œil. */
function healthSummary(sources: readonly SourceStateView[]): string {
  const counts = new Map<SourceStateView['health'], number>();
  for (const source of sources) counts.set(source.health, (counts.get(source.health) ?? 0) + 1);
  const parts = (Object.keys(SUMMARY_LABELS) as SourceStateView['health'][]).flatMap((health) => {
    const n = counts.get(health) ?? 0;
    return n === 0 ? [] : [`${n} ${SUMMARY_LABELS[health][n > 1 ? 1 : 0]}`];
  });
  const total = `${sources.length} source${sources.length > 1 ? 's' : ''}`;
  return [total, ...parts].join(' · ');
}

interface SourcesPanelProps {
  readonly sources: readonly SourceStateView[];
  readonly nowMs: number;
  readonly onBack: () => void;
  /** Ouvre la fiche d'une source : ses infos ET ses annonces actives. */
  readonly onOpenSource?: (sourceId: string) => void;
}

/**
 * « LISONS-NOUS DÉJÀ CE SITE ? » — la question qu'on ne pouvait pas poser.
 *
 * Deux cent vingt-trois sources s'affichaient d'affilée, sans le moindre champ
 * de recherche : vérifier qu'une agence était déjà collectée demandait de
 * parcourir la liste à l'œil. En une semaine, cinq agences ont été demandées
 * alors qu'elles étaient lues depuis des jours — Immobilière ABC sous le nom de
 * son cabinet, Étude Lotte, Agence Passy, ERA, ImmoJeune.
 *
 * LA RECHERCHE PORTE AUSSI SUR LE DOMAINE, et c'est tout l'intérêt : le nom
 * commercial n'est pas l'identifiant. « immobiliere-abc.com » ne ressemble en
 * rien à « Abyla Bosse », et c'est pourtant le même site.
 */
function matchesQuery(source: SourceStateView, query: string): boolean {
  if (query === '') return true;
  const info = SOURCES[source.sourceId];
  const haystack = comparable([source.sourceId, info?.name ?? '', info?.domain ?? ''].join(' '));
  return haystack.includes(query);
}

export function SourcesPanel({
  sources,
  nowMs,
  onBack,
  onOpenSource,
}: SourcesPanelProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const cherche = comparable(query);
  const shown = sources.filter((source) => matchesQuery(source, cherche));
  return (
    <div>
      <header className="mb-2 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" /> Retour
        </Button>
      </header>

      <h1 className="text-xl font-bold">État des sources</h1>
      {sources.length > 0 && (
        <p className="text-muted-foreground mb-3 text-sm" data-testid="sources-count">
          {healthSummary(sources)}
        </p>
      )}

      {sources.length > 0 && (
        <Input
          type="search"
          className="mb-3"
          value={query}
          aria-label="Rechercher une source"
          placeholder="Nom de l’agence ou adresse du site…"
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      {sources.length === 0 ? (
        <p>Aucune source n’a encore été exécutée.</p>
      ) : shown.length === 0 ? (
        <Card className="text-muted-foreground py-8 text-center text-[0.92rem]">
          Aucune source ne porte ce nom ni ce domaine — celle-ci n’est donc pas encore lue.
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((source) => (
            <Card
              key={source.sourceId}
              // Rendue comme <li> sémantique via le wrapper : Card est un div,
              // on garde la liste pour les lecteurs d'écran.
              role="listitem"
              className={`border-l-4 ${sourceHealthBorder(source.health)}`}
            >
              <div className="mb-2 flex justify-between">
                {/* Le nom mène au catalogue de la source. Le reste de la carte
                  reste inerte : on ne voulait pas qu'un clic sur un chiffre
                  d'observabilité fasse changer de page. */}
                {onOpenSource === undefined ? (
                  <strong>{formatSourceName(source.sourceId)}</strong>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenSource(source.sourceId)}
                    className="hover:text-primary cursor-pointer text-left font-bold transition-colors"
                  >
                    {formatSourceName(source.sourceId)}
                  </button>
                )}
                <span className="text-muted-foreground text-[0.8rem]">
                  {formatSourceHealth(source.health)}
                </span>
              </div>

              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[0.92rem]">
                <dt className="text-muted-foreground">Dernière exécution</dt>
                <dd>{formatAge(source.lastRunAt, nowMs)}</dd>

                <dt className="text-muted-foreground">Dernière réussite</dt>
                <dd>{formatAge(source.lastSuccessAt, nowMs)}</dd>

                <dt className="text-muted-foreground">Nouvelles annonces (moyenne)</dt>
                <dd>{source.averageNewListingCount.toFixed(1)}</dd>

                <dt className="text-muted-foreground">Erreurs consécutives</dt>
                <dd>{source.consecutiveErrors}</dd>

                {/* POURQUOI, et pas seulement l'état : comment le dernier
                    passage s'est terminé, et ce qu'il a rapporté. */}
                {source.lastStopReason != null && (
                  <>
                    <dt className="text-muted-foreground">Dernier passage</dt>
                    <dd>
                      {STOP_LABELS[source.lastStopReason] ?? source.lastStopReason}
                      {source.lastListingsFound != null &&
                        ` · ${source.lastListingsFound} annonce${source.lastListingsFound > 1 ? 's' : ''} rendue${source.lastListingsFound > 1 ? 's' : ''}`}
                    </dd>
                  </>
                )}

                {source.activeListings !== undefined && (
                  <>
                    <dt className="text-muted-foreground">Annonces en ligne</dt>
                    <dd>{source.activeListings}</dd>
                  </>
                )}

                {source.lastFullPassAt != null && (
                  <>
                    <dt className="text-muted-foreground">Dernier passage complet</dt>
                    <dd>{formatAge(source.lastFullPassAt, nowMs)}</dd>
                  </>
                )}
              </dl>

              {/* Une agence sans annonce n'est pas une agence en panne : trente
                  sources sont dans ce cas et se portent très bien. Le dire
                  évite de partir en réparation pour rien. */}
              {source.health === 'healthy' &&
                source.activeListings === 0 &&
                source.lastStopReason === 'empty' && (
                  <p className="text-muted-foreground mt-1 text-[0.85rem]">
                    Cette agence n’a aucun bien à louer en ce moment. Rien à réparer.
                  </p>
                )}

              {/* §10 : expliquer une mise au repos plutôt que de la subir. */}
              {source.cooldownUntil !== null && (
                <p className="mt-1 text-[0.85rem] text-muted-foreground">
                  En repos après un HTTP 429 jusqu’à{' '}
                  {new Date(source.cooldownUntil).toLocaleTimeString('fr-FR')}. Aucune requête n’est
                  émise vers cette source d’ici là.
                </p>
              )}

              {source.health === 'blocked' && (
                <p className="mt-1 text-[0.85rem] text-muted-foreground">
                  Cette source refuse l’accès automatisé. Le scraper est arrêté et ne tentera aucun
                  contournement.
                </p>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
