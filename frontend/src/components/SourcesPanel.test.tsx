import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SourceHealth, SourceStateView } from '../types.js';
import { formatSourceHealth } from '../format.js';
import { SourcePanel } from './SourcePanel.js';
import { SourcesPanel } from './SourcesPanel.js';

const source = (sourceId: string, health: SourceHealth): SourceStateView => ({
  sourceId,
  health,
  lastRunAt: null,
  lastSuccessAt: null,
  last429At: null,
  cooldownUntil: null,
  consecutiveErrors: 0,
  averageNewListingCount: 0,
});

describe('SourcesPanel', () => {
  it('annonce le nombre de sources, puis celles qui demandent un œil', () => {
    render(
      <SourcesPanel
        sources={[
          source('orpi', 'healthy'),
          source('citya', 'degraded'),
          source('fnaim', 'healthy'),
          source('pap', 'degraded'),
        ]}
        nowMs={0}
        onBack={() => {}}
      />,
    );
    expect(screen.getByTestId('sources-count')).toHaveTextContent('4 sources · 2 OK · 2 dégradées');
  });
});

const TOUTES: readonly SourceHealth[] = ['healthy', 'degraded', 'cooldown', 'disabled', 'blocked'];

/**
 * La liste et la fiche parlent de la même source : elles doivent en dire la
 * même chose. Chacune portait sa propre table de libellés, donc renommer un
 * état d'un côté l'aurait laissé intact de l'autre — ce test tombe si une
 * copie locale réapparaît.
 */
describe('libellé de santé', () => {
  it.each(TOUTES)('dit la même chose sur la liste et sur la fiche (%s)', (health) => {
    const attendu = formatSourceHealth(health);
    const etat = source('orpi', health);

    const liste = render(<SourcesPanel sources={[etat]} nowMs={0} onBack={() => {}} />);
    expect(liste.getByText(attendu)).toBeInTheDocument();
    liste.unmount();

    const fiche = render(
      <SourcePanel
        sourceId="orpi"
        state={etat}
        listings={[]}
        nowMs={0}
        onBack={() => {}}
        onSelect={() => {}}
        onFavorite={() => {}}
      />,
    );
    expect(fiche.getByText(attendu)).toBeInTheDocument();
    fiche.unmount();
  });
});
