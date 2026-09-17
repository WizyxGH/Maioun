/**
 * « JE VOIS DES ANNONCES QUE J'AI CONTACTÉES » — relevé du 2026-09-17.
 *
 * La section « À contacter maintenant » de la page de recherche ne regardait
 * que l'urgence : une annonce prioritaire y restait après un appel ou un
 * message, comme si rien n'avait été fait. L'écran d'accueil, lui, les
 * écartait déjà — deux réponses pour la même question.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Client from './api/client.js';
import type { ListingView } from './types.js';
import { MOCK_LISTINGS } from './api/mock-data.js';

/** Les deux annonces les plus pressantes du jeu d'essai. */
const [FIRST, SECOND] = [...MOCK_LISTINGS].sort((a, b) => b.actionPriority - a.actionPriority) as [
  ListingView,
  ListingView,
];

const state = vi.hoisted(() => ({ listings: [] as readonly ListingView[] }));

vi.mock('./api/client.js', async (original) => {
  const actual = await original<typeof Client>();
  return {
    ...actual,
    fetchListings: () =>
      Promise.resolve({
        listings: state.listings,
        total: state.listings.length,
        limit: 50,
        offset: 0,
      }),
  };
});

const { App } = await import('./App.js');

async function openSearch(): Promise<void> {
  render(<App />);
  const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
  await userEvent.click(tabs[0]!);
}

/**
 * Ce qui est rangé sous « À contacter maintenant ».
 *
 * La carte n'affiche pas le titre de l'annonce mais son type et son quartier ;
 * son étiquette de lecture d'écran, elle, commence par le loyer, qui suffit à
 * distinguer les deux annonces de ce test.
 */
async function urgentCards(): Promise<string[]> {
  const section = await screen.findByLabelText('À contacter maintenant');
  return within(section)
    .getAllByRole('button', { name: /ouvrir la fiche/ })
    .map((button) => button.getAttribute('aria-label') ?? '');
}

/** Le loyer tel que l'étiquette l'écrit, pour reconnaître une annonce. */
const rentOf = (listing: ListingView): string => `${listing.price.value} `;

describe('section « À contacter maintenant »', () => {
  it('montre une annonce pressante tant que personne ne l’a contactée', async () => {
    state.listings = [FIRST, SECOND];
    await openSearch();
    await waitFor(async () => {
      expect((await urgentCards()).join('|')).toContain(rentOf(FIRST));
    });
  });

  it('en retire celle qu’on a déjà contactée, sans la faire disparaître', async () => {
    state.listings = [{ ...FIRST, tracking: 'contacted' }, SECOND];
    await openSearch();

    await waitFor(async () => {
      const urgent = (await urgentCards()).join('|');
      expect(urgent).not.toContain(rentOf(FIRST));
      // La seconde y est toujours : ce n'est pas la section entière qui a disparu.
      expect(urgent).toContain(rentOf(SECOND));
    });

    // Elle reste consultable, plus bas dans la liste — rien n'est escamoté.
    const everywhere = screen.getAllByRole('button', { name: /ouvrir la fiche/ });
    expect(everywhere.map((b) => b.getAttribute('aria-label') ?? '').join('|')).toContain(
      rentOf(FIRST),
    );
  });

  it('garde celle que l’utilisateur a lui-même marquée « à contacter »', async () => {
    state.listings = [{ ...FIRST, tracking: 'toContact' }, SECOND];
    await openSearch();
    await waitFor(async () => {
      expect((await urgentCards()).join('|')).toContain(rentOf(FIRST));
    });
  });
});
