/**
 * Le cycle d'une recherche enregistrée, vu de l'écran.
 *
 * « Mettre à jour » est né sans test, et le défaut s'est vu tout de suite :
 * l'utilisateur a signalé que le bouton « ne fait rien ».
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedSearchesPanel } from './SavedSearchesPanel.js';
import type { SavedSearch } from '../saved-searches.js';
import { fetchReferencePoints, saveReferencePoints } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  fetchReferencePoints: vi.fn(),
  saveReferencePoints: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchReferencePoints).mockReset();
  vi.mocked(saveReferencePoints).mockReset();
  vi.mocked(fetchReferencePoints).mockResolvedValue([
    { label: 'Travail', address: '1 place Masséna, 06000 Nice', mode: 'transit' },
    { label: 'Gare', address: 'Avenue Thiers, 06000 Nice', mode: 'walking' },
  ]);
  vi.mocked(saveReferencePoints).mockResolvedValue(undefined);
});

const SEARCH: SavedSearch = {
  id: 's1',
  name: 'Studio Libération',
  createdAt: '2026-09-01T10:00:00.000Z',
  criteria: { cities: ['nice'], maxPrice: 700, minArea: 20 },
  view: {
    minPrice: null,
    maxPrice: null,
    minArea: null,
    minRooms: null,
    minOccupants: null,
    types: [],
    sources: [],
    sort: 'priority',
    search: '',
  },
} as unknown as SavedSearch;

function renderPanel(
  onUpdate = vi.fn(),
  onEdit = vi.fn(),
  onSaveCurrent = vi.fn(),
): {
  onUpdate: ReturnType<typeof vi.fn>;
  onEdit: ReturnType<typeof vi.fn>;
  onSaveCurrent: ReturnType<typeof vi.fn>;
} {
  render(
    <SavedSearchesPanel
      searches={[SEARCH]}
      nowMs={Date.parse('2026-09-07T10:00:00.000Z')}
      available
      countFor={() => 3}
      onBack={() => {}}
      onApply={() => {}}
      onDelete={() => {}}
      onRename={() => {}}
      onUpdate={onUpdate}
      onEdit={onEdit}
      onSaveCurrent={onSaveCurrent}
      suggestion="Ma recherche"
    />,
  );
  return { onUpdate, onEdit, onSaveCurrent };
}

describe('mettre à jour une recherche enregistrée', () => {
  it('demande confirmation avant de remplacer', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderPanel();

    await user.click(
      screen.getByRole('button', {
        name: /Mettre à jour « Studio Libération » avec les filtres actuels/,
      }),
    );

    // Rien n'est encore remplacé : le geste écrase des réglages qu'on ne
    // retrouvera pas, il se confirme.
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remplacer les réglages' })).toBeVisible();
  });

  it('REMPLACE une fois confirmé', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderPanel();

    await user.click(
      screen.getByRole('button', {
        name: /Mettre à jour « Studio Libération » avec les filtres actuels/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Remplacer les réglages' }));

    expect(onUpdate).toHaveBeenCalledWith('s1');
  });

  it('renonce sans rien remplacer', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderPanel();

    await user.click(
      screen.getByRole('button', {
        name: /Mettre à jour « Studio Libération » avec les filtres actuels/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onUpdate).not.toHaveBeenCalled();
    // Et la rangée d'actions revient.
    expect(screen.getByRole('button', { name: /Renommer/ })).toBeVisible();
  });
});

describe('accusé de mise à jour', () => {
  it('DIT que les réglages ont été remplacés', async () => {
    // Sans cela le bouton passe pour mort : rien d'autre ne bouge à l'écran
    // quand les filtres courants sont déjà ceux enregistrés.
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('button', {
        name: /Mettre à jour « Studio Libération » avec les filtres actuels/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Remplacer les réglages' }));

    expect(screen.getByText('Réglages remplacés')).toBeVisible();
  });
});

describe('modifier les critères sur place', () => {
  it('ouvre les réglages DE CETTE recherche', async () => {
    // Le geste qu'on cherche en arrivant ici : corriger une borne de loyer
    // demandait jusqu'ici de rappeler la recherche, de régler l'écran, de
    // revenir, puis de mettre à jour — trois écrans pour retrouver son chemin.
    const user = userEvent.setup();
    const { onEdit } = renderPanel();

    await user.click(
      screen.getByRole('button', { name: /Modifier les critères de « Studio Libération »/ }),
    );

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0]?.[0]).toMatchObject({ name: 'Studio Libération' });
  });
});

describe('l’adresse de référence ne se règle PAS ici', () => {
  it('ne propose aucun bouton d’adresse sur une recherche', async () => {
    // Elle est commune au compte : la régler depuis une recherche laissait
    // croire que chacune vise un lieu de travail différent. Elle vit dans les
    // Paramètres, avec les autres points de repère.
    renderPanel();
    await screen.findByText(/Trajet depuis 1 place Masséna/);
    expect(screen.queryByRole('button', { name: /Adresse de référence/ })).toBeNull();
  });

  it('DIT depuis où le trajet se compte, sans permettre d’y toucher', async () => {
    const { onEdit } = renderPanel();
    // La mention reste : sans elle, on ne saurait pas d'où viennent les durées.
    await screen.findByText(/Trajet depuis 1 place Masséna/);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('crée une recherche avec son seul nom', async () => {
    const user = userEvent.setup();
    const { onSaveCurrent } = renderPanel();

    await user.click(screen.getByRole('button', { name: /Enregistrer la recherche actuelle/ }));
    expect(screen.queryByRole('combobox', { name: /Adresse de référence/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(onSaveCurrent).toHaveBeenCalledWith('Ma recherche'));
    // Rien n'est écrit dans les points de repère du compte.
    expect(saveReferencePoints).not.toHaveBeenCalled();
  });
});
