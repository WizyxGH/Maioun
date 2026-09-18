/**
 * Le fond de carte se choisit et se retient ; les marqueurs ne bougent pas.
 *
 * Et surtout : la carte MONTRE UN MARQUEUR PAR CASE, pas un par annonce —
 * c'est ce qui la garde fluide au-delà de quelques centaines d'annonces.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapView, { readMapStyle } from './MapView.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import type { ListingView } from '../types.js';

/** Une annonce de démonstration, posée où on veut. */
function at(id: string, latitude: number, longitude: number): ListingView {
  const base = MOCK_LISTINGS[0]!;
  return {
    ...base,
    id,
    latitude: { ...base.latitude!, value: latitude },
    longitude: { ...base.longitude!, value: longitude },
  };
}

describe('MapView — fond de carte', () => {
  afterEach(() => localStorage.clear());

  it('part du plan, et retient la vue satellite choisie', async () => {
    const { container } = render(<MapView listings={[]} onOpen={() => undefined} />);
    const plan = screen.getByRole('button', { name: 'Plan' });
    const satellite = screen.getByRole('button', { name: 'Satellite' });
    expect(plan.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.leaflet-control-attribution')?.textContent).toContain(
      'OpenStreetMap',
    );

    await userEvent.click(satellite);
    expect(satellite.getAttribute('aria-pressed')).toBe('true');
    expect(readMapStyle()).toBe('satellite');
    expect(container.querySelector('.leaflet-control-attribution')?.textContent).toContain('Esri');
    expect(container.querySelector('.leaflet-control-attribution')?.textContent).not.toContain(
      'OpenStreetMap',
    );
  });

  it('rouvre sur le fond mémorisé', () => {
    localStorage.setItem('maioun.mapStyle', 'satellite');
    render(<MapView listings={[]} onOpen={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Satellite' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});

describe('MapView — regroupement', () => {
  // JSDOM NE FAIT PAS DE MISE EN PAGE : tout élément y mesure zéro, et une
  // carte sans dimensions n'a ni zoom utile ni notion de « visible ». On lui
  // donne donc une taille d'écran, sinon les deux cents annonces et les deux
  // annonces éloignées se retrouvent dans la même case.
  const sizes = ['clientWidth', 'clientHeight'] as const;
  const original = sizes.map((name) =>
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
  );
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 600,
    });
  });
  afterAll(() => {
    sizes.forEach((name, index) => {
      const descriptor = original[index];
      if (descriptor !== undefined) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
    });
  });

  it('pose un seul marqueur pour deux cents annonces superposées', () => {
    // Un dixième de seconde d'arc entre chacune : à tout zoom courant, elles
    // tombent dans la même case.
    const listings = Array.from({ length: 200 }, (_, index) =>
      at(`serre:${index}`, 43.7 + index * 0.000001, 7.26 + index * 0.000001),
    );
    const { container } = render(<MapView listings={listings} onOpen={() => undefined} />);
    const markers = container.querySelectorAll('.leaflet-marker-icon');
    expect(markers).toHaveLength(1);
    // L'amas DIT combien il porte : rien ne disparaît en silence.
    expect(markers[0]?.textContent).toBe('200');
  });

  it('laisse leur pastille de prix aux annonces éloignées', () => {
    const listings = [at('a', 43.66, 7.19), at('b', 43.75, 7.32)];
    const { container } = render(<MapView listings={listings} onOpen={() => undefined} />);
    const markers = container.querySelectorAll('.leaflet-marker-icon');
    expect(markers).toHaveLength(2);
    expect(markers[0]?.textContent).toContain('€');
  });

  it('compte les annonces sans coordonnées au lieu de les placer', () => {
    const muette = { ...at('muette', 0, 0), latitude: undefined, longitude: undefined };
    const { container } = render(
      <MapView listings={[at('a', 43.7, 7.26), muette]} onOpen={() => undefined} />,
    );
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1);
    expect(screen.getByText(/1 annonce localisée sur les 2 de la liste/)).toBeTruthy();
  });

  /**
   * LA LIGNE DE LOCALISATION EST TOUJOURS LÀ. Sans elle, le bouton « Voir
   * l'annonce » prenait sa place juste sous le titre, et la bulle d'une annonce
   * sans voie se lisait comme si son adresse ÉTAIT « Voir l'annonce » — d'où un
   * signalement portant sur « certaines » adresses : celles que la source ne
   * publie pas.
   */
  it('garde une ligne de localisation même sans voie publiée', async () => {
    const sansVoie: ListingView = {
      ...at('sans-voie', 43.7, 7.26),
      address: { ...MOCK_LISTINGS[0]!.address, value: null },
    };
    const { container } = render(<MapView listings={[sansVoie]} onOpen={() => undefined} />);
    await userEvent.click(container.querySelector('.leaflet-marker-icon') as Element);
    const bulle = container.querySelector('.leaflet-popup-content')?.firstElementChild;
    const blocs = [...(bulle?.children ?? [])];
    // Titre, localisation, bouton : le bouton n'est jamais le deuxième bloc.
    expect(blocs).toHaveLength(3);
    expect(blocs[1]?.tagName.toLowerCase()).toBe('div');
    expect(blocs[1]?.textContent).toContain('Nice');
    expect(blocs[2]?.tagName.toLowerCase()).toBe('button');
  });

  it('écrit la voie et la commune quand la source publie les deux', async () => {
    const { container } = render(
      <MapView listings={[at('avec-voie', 43.7, 7.26)]} onOpen={() => undefined} />,
    );
    await userEvent.click(container.querySelector('.leaflet-marker-icon') as Element);
    const blocs = [
      ...(container.querySelector('.leaflet-popup-content')?.firstElementChild?.children ?? []),
    ];
    expect(blocs[1]?.textContent).toMatch(/Démonstration.*Nice/);
  });
});
