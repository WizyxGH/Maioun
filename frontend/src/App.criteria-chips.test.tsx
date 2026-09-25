/**
 * « POURQUOI SEULEMENT 3 FILTRES ? » — relevé du 2026-09-16.
 *
 * La pastille du bouton « Filtres » et la barre de puces ne montraient que les
 * filtres du navigateur. Les CRITÈRES — 87 quartiers, deux exclusions, un
 * plafond de trajet — restreignaient la liste côté serveur sans apparaître
 * nulle part.
 *
 * PUIS DEUX PUCES SONT RESTÉES À PART : les quartiers et le plafond de trajet
 * s'affichaient sans croix, avec un renvoi « à régler dans Filtres », quand
 * toutes les autres se retiraient d'un clic. Demande de l'utilisateur :
 * « pourquoi ces filtres sont différents des autres, il ne faudrait pas ».
 * Elles se retirent maintenant comme les autres, et « Effacer tout » efface
 * bien tout — avec un retour arrière d'un clic, parce que l'écriture est
 * enregistrée et que 87 quartiers cochés un à un ne se reconstituent pas.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NICE_DISTRICTS } from '@maioun/shared';
import type * as Client from './api/client.js';
import type { FilterConfig } from './types.js';

const state = vi.hoisted(() => ({
  criteria: {} as FilterConfig,
  saved: [] as FilterConfig[],
  listingCalls: 0,
  /** Fait échouer la prochaine écriture : un réseau qui lâche au mauvais moment. */
  failNextSave: false,
}));

vi.mock('./api/client.js', async (original) => {
  const actual = await original<typeof Client>();
  return {
    ...actual,
    fetchFilters: () => Promise.resolve(state.criteria),
    saveFilters: (filters: FilterConfig) => {
      if (state.failNextSave) {
        state.failNextSave = false;
        return Promise.reject(new Error('réseau'));
      }
      state.saved.push(filters);
      state.criteria = filters;
      return Promise.resolve(filters);
    },
    fetchListings: (options: Client.FetchListingsOptions = {}) => {
      state.listingCalls += 1;
      return actual.fetchListings(options);
    },
  };
});

const { App } = await import('./App.js');

/** Les critères du compte, tels qu'ils sont enregistrés aujourd'hui. */
const ACCOUNT_CRITERIA: FilterConfig = {
  cities: ['nice'],
  minPrice: 250,
  maxPrice: 700,
  minArea: 20,
  maxCommuteMinutes: 60,
  excludeFlatShare: true,
  excludeStudent: true,
  landlordFilter: 'all',
  districts: NICE_DISTRICTS.slice(0, 87).map((district) => district.slug),
};

async function openSearch(): Promise<void> {
  render(<App />);
  const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
  await userEvent.click(tabs[0]!);
}

describe('les critères comptent dans la barre de filtres', () => {
  beforeEach(() => {
    localStorage.clear();
    state.criteria = { ...ACCOUNT_CRITERIA };
    state.saved.length = 0;
    state.listingCalls = 0;
    state.failNextSave = false;
  });

  it('affiche une puce par critère, et la pastille les compte tous', async () => {
    await openSearch();

    // Les critères, qui ne se voyaient nulle part.
    expect(await screen.findByText('87 quartiers')).toBeInTheDocument();
    expect(screen.getByText('Trajet ≤ 60 min')).toBeInTheDocument();
    expect(screen.getByText('Sans colocations')).toBeInTheDocument();
    expect(screen.getByText('Sans logements étudiants')).toBeInTheDocument();

    // QUATRE CRITÈRES, ET AUCUN FILTRE RAPIDE : ils s'ouvrent vides depuis que
    // les valeurs d'une personne ont quitté le code. Le budget et la surface du
    // compte ne comptent pas — ils sont le PÉRIMÈTRE, comme la commune, et la
    // croix qu'ils ont portée un temps ne retirait rien (voir
    // `criteria-chips.ts`).
    const button = screen.getAllByRole('button', { name: 'Filtres' })[0]!;
    expect(within(button).getByText('4')).toBeInTheDocument();
    expect(screen.queryByText(/250 – 700 €/)).toBeNull();
    expect(screen.queryByText('≥ 20 m²')).toBeNull();
  });

  it('tient TOUTES les puces sur une seule rangée qui défile', async () => {
    await openSearch();
    await screen.findByText('87 quartiers');

    // Elles se repliaient sur trois lignes à dix filtres posés, et repoussaient
    // la première annonce sous le pli d'un téléphone.
    const rail = screen.getByTestId('filter-chips');
    for (const label of ['87 quartiers', 'Trajet ≤ 60 min', 'Sans colocations']) {
      expect(within(rail).getByText(label), label).toBeInTheDocument();
    }
    expect(rail.className).toContain('overflow-x-auto');
    expect(rail.className).not.toContain('flex-wrap');

    // « Effacer tout » reste HORS de la rangée : dedans, il faudrait faire
    // défiler jusqu'au bout pour trouver le bouton qui sert à ne plus défiler.
    const clear = screen.getByRole('button', { name: 'Effacer tout' });
    expect(rail.contains(clear)).toBe(false);
  });

  it('retire les quartiers d’un clic, comme n’importe quelle autre puce', async () => {
    await openSearch();
    await screen.findByText('87 quartiers');
    // Le renvoi au panneau n'a plus lieu d'être : la croix est là.
    expect(screen.queryByText('à régler dans Filtres')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Retirer le filtre 87 quartiers/ }));

    await waitFor(() => expect(state.saved).toHaveLength(1));
    // Liste vide = toute la commune, pour la liste comme pour les alertes.
    expect(state.saved[0]?.districts).toEqual([]);
    // Les autres critères survivent au retrait d'un seul.
    expect(state.saved[0]?.excludeFlatShare).toBe(true);
    await waitFor(() => expect(screen.queryByText('87 quartiers')).toBeNull());
  });

  it('retire le plafond de trajet, et il ne revient pas', async () => {
    await openSearch();
    await screen.findByText('Trajet ≤ 60 min');

    await userEvent.click(screen.getByRole('button', { name: /Retirer le filtre Trajet/ }));

    await waitFor(() => expect(state.saved).toHaveLength(1));
    // Ni 60 recomblé par le serveur, ni 0 — qui ne garderait aucune annonce
    // localisée.
    expect(state.saved[0]?.maxCommuteMinutes).toBeUndefined();
    expect(state.saved[0]?.maxCommuteMinutes).not.toBe(0);
    await waitFor(() => expect(screen.queryByText('Trajet ≤ 60 min')).toBeNull());
  });

  it('retire une exclusion en écrivant le critère, puis recharge la liste', async () => {
    await openSearch();
    await screen.findByText('Sans colocations');
    const before = state.listingCalls;

    await userEvent.click(
      screen.getByRole('button', { name: /Retirer le filtre Sans colocations/ }),
    );

    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0]?.excludeFlatShare).toBe(false);
    // Les autres critères survivent au retrait d'un seul.
    expect(state.saved[0]?.districts).toHaveLength(87);
    expect(state.saved[0]?.excludeStudent).toBe(true);
    await waitFor(() => expect(state.listingCalls).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText('Sans colocations')).toBeNull());
  });

  it('« Effacer tout » lève AUSSI les critères, et l’enregistre', async () => {
    await openSearch();
    await screen.findByText('Sans colocations');
    // La phrase qui excusait l'exception a disparu avec l'exception.
    expect(screen.queryByText(/ne touche qu’à l’affichage/)).toBeNull();
    const before = state.listingCalls;

    await userEvent.click(screen.getByRole('button', { name: 'Effacer tout' }));

    await waitFor(() => expect(state.saved).toHaveLength(1));
    const written = state.saved[0]!;
    expect(written.districts).toEqual([]);
    expect(written.excludeFlatShare).toBe(false);
    expect(written.excludeStudent).toBe(false);
    expect(written.maxCommuteMinutes).toBeUndefined();
    // LE PÉRIMÈTRE RESTE — la commune, sans quoi il n'y a plus rien à chercher.
    expect(written.cities).toEqual(['nice']);
    // LE BUDGET ET LA SURFACE RESTENT, avec la commune : ils sont le périmètre.
    // Ils ont porté une puce un temps, et l'effacer n'effaçait rien — le
    // serveur recomblait la clé absente à la lecture suivante.
    expect(written.maxPrice).toBe(700);
    expect(written.minArea).toBe(20);
    // La liste est rechargée : c'est le serveur qui filtre là-dessus.
    await waitFor(() => expect(state.listingCalls).toBeGreaterThan(before));
    // Et la barre dit la même chose que la liste : plus une puce.
    await waitFor(() => expect(screen.queryByText('87 quartiers')).toBeNull());
    expect(screen.queryByText('Sans colocations')).toBeNull();
    expect(screen.queryByText('Trajet ≤ 60 min')).toBeNull();
    // PLUS DE RANGÉE DU TOUT : il ne reste aucune puce à montrer. La bannière
    // « Annuler », elle, énumère ce qui vient d'être levé, budget compris —
    // c'est son travail, et c'est pourquoi on regarde la rangée et non l'écran.
    expect(screen.queryByTestId('filter-chips')).toBeNull();
  });

  it('et il se défait d’un seul clic : « Annuler » remet les 87 quartiers', async () => {
    await openSearch();
    await screen.findByText('87 quartiers');

    await userEvent.click(screen.getByRole('button', { name: 'Effacer tout' }));
    await waitFor(() => expect(state.saved).toHaveLength(1));

    // La rangée NOMME ce qui a été levé : on le vérifie sans rouvrir le
    // panneau, et l'on sait ce que « Annuler » remettra.
    const undo = await screen.findByTestId('cleared-undo');
    expect(undo).toHaveTextContent('87 quartiers');
    expect(undo).toHaveTextContent('Trajet ≤ 60 min');

    await userEvent.click(within(undo).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(state.saved).toHaveLength(2));
    expect(state.saved[1]?.districts).toHaveLength(87);
    expect(state.saved[1]?.excludeFlatShare).toBe(true);
    expect(state.saved[1]?.excludeStudent).toBe(true);
    expect(state.saved[1]?.maxCommuteMinutes).toBe(60);
    expect(await screen.findByText('87 quartiers')).toBeInTheDocument();
    expect(screen.queryByTestId('cleared-undo')).toBeNull();
  });

  it('et il SURVIT AU RECHARGEMENT de la page', async () => {
    // Il ne vivait qu'en mémoire de page. Un rafraîchissement, ou l'onglet
    // déchargé par le téléphone, et les 87 quartiers n'avaient plus aucun
    // chemin de retour — la perte silencieuse que cette rangée évite.
    await openSearch();
    await screen.findByText('87 quartiers');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer tout' }));
    await waitFor(() => expect(state.saved).toHaveLength(1));
    await screen.findByTestId('cleared-undo');

    cleanup();
    await openSearch();

    const undo = await screen.findByTestId('cleared-undo');
    expect(undo).toHaveTextContent('87 quartiers');
    await userEvent.click(within(undo).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(state.saved).toHaveLength(2));
    expect(state.saved[1]?.districts).toHaveLength(87);
  });

  it('mais PAS si les critères ont été réglés depuis', async () => {
    // Réglés entre temps depuis le panneau ou une autre machine : « Annuler »
    // écraserait ce réglage-là au lieu de défaire l'effacement.
    await openSearch();
    await screen.findByText('87 quartiers');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer tout' }));
    await waitFor(() => expect(state.saved).toHaveLength(1));

    state.criteria = { ...state.criteria, excludeFlatShare: true };
    cleanup();
    await openSearch();

    // La puce prouve que les critères du compte sont bien arrivés : sans elle,
    // l'absence du retour arrière ne dirait rien.
    await screen.findByText('Sans colocations');
    expect(screen.queryByTestId('cleared-undo')).toBeNull();
  });

  it('garde le bouton « Annuler » quand le rétablissement échoue', async () => {
    // Sinon l'écran montrerait des critères rétablis que le serveur ne connaît
    // pas, et le seul moyen de les rétablir vraiment serait parti avec la
    // rangée : la perte silencieuse qu'on cherche à éviter.
    await openSearch();
    await screen.findByText('87 quartiers');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer tout' }));
    const undo = await screen.findByTestId('cleared-undo');

    state.failNextSave = true;
    await userEvent.click(within(undo).getByRole('button', { name: 'Annuler' }));

    expect(await screen.findByText(/n’ont pas pu être rétablis/)).toBeInTheDocument();
    expect(await screen.findByTestId('cleared-undo')).toBeInTheDocument();
    // Et l'écran redit la vérité du serveur : les critères sont bien effacés.
    expect(screen.queryByText('87 quartiers')).toBeNull();
  });

  it('retire le retour arrière dès qu’un critère est réglé ensuite', async () => {
    // « Annuler » ne défait que le geste qu'il annonce : il ne doit pas
    // remettre un critère que l'on vient de lever exprès après l'effacement.
    await openSearch();
    await screen.findByText('Sans colocations');

    await userEvent.click(
      screen.getByRole('button', { name: /Retirer le filtre Sans colocations/ }),
    );
    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(screen.queryByTestId('cleared-undo')).toBeNull();
  });
});
