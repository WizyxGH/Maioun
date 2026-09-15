import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SourceStateView } from '../types.js';
import { SourcesPanel } from './SourcesPanel.js';

const source = (sourceId: string, health: SourceStateView['health']): SourceStateView => ({
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
