/**
 * Le fond de carte se choisit et se retient ; les marqueurs ne bougent pas.
 *
 * Et surtout : la carte MONTRE UN MARQUEUR PAR CASE, pas un par annonce —
 * c'est ce qui la garde fluide au-delà de quelques centaines d'annonces.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapView, { readMapStyle } from './MapView.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { DISTRICT_BOUNDARIES } from '../district-boundaries.generated.js';
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

  /**
   * LA PASTILLE PASSE PAR `formatPrice`, comme les cartes de la liste : le
   * montant était écrit à la main, donc « 630.5 € » avec un point décimal, et
   * « — € » pour un loyer absent — un tiret a l'air d'une valeur.
   */
  it('écrit les centimes à la française sur la pastille de prix', () => {
    const centimes: ListingView = {
      ...at('centimes', 43.7, 7.26),
      price: { ...MOCK_LISTINGS[0]!.price, value: 630.5 },
    };
    const { container } = render(<MapView listings={[centimes]} onOpen={() => undefined} />);
    expect(container.querySelector('.leaflet-marker-icon')?.textContent).toBe('630,50 €');
  });

  it('dit « N/A » sur la pastille d’une annonce sans loyer publié', () => {
    const sansLoyer: ListingView = {
      ...at('sans-loyer', 43.7, 7.26),
      price: { ...MOCK_LISTINGS[0]!.price, value: null },
    };
    const { container } = render(<MapView listings={[sansLoyer]} onOpen={() => undefined} />);
    const texte = container.querySelector('.leaflet-marker-icon')?.textContent;
    expect(texte).toBe('N/A');
    expect(texte).not.toContain('—');
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

/**
 * LES CONTOURS DE QUARTIERS.
 *
 * Trois choses à ne pas casser : ils n'entrent pas dans le premier affichage,
 * ils ne mangent pas le clic d'une annonce, et ils s'atteignent sans souris.
 */
describe('MapView — contours de quartiers', () => {
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

  /** Le menu n'existe qu'une fois le morceau des contours arrivé. */
  async function carte(listings: readonly ListingView[] = []): Promise<HTMLElement> {
    const { container } = render(<MapView listings={listings} onOpen={() => undefined} />);
    await screen.findByLabelText('Délimiter un quartier');
    return container as HTMLElement;
  }

  it('dessine un contour par quartier publié, et cite l’IGN', async () => {
    const container = await carte();
    expect(container.querySelectorAll('path.maioun-quartier')).toHaveLength(
      DISTRICT_BOUNDARIES.features.length,
    );
    // La Licence Ouverte exige l'attribution, à côté de celle d'OpenStreetMap.
    const attribution = container.querySelector('.leaflet-control-attribution')?.textContent;
    expect(attribution).toContain('IGN');
    expect(attribution).toContain('OpenStreetMap');
  });

  /**
   * `fireEvent` PLUTÔT QUE `userEvent` ICI : ce dernier joue une suite
   * pointerdown/pointerup, et deux clics rapprochés déclenchent la simulation
   * de double-tap de Leaflet, qui demande à jsdom une position d'écran que
   * jsdom ne calcule pas — d'où un « Invalid LatLng (NaN, NaN) » sans rapport
   * avec ce qu'on teste. Un clic seul suffit à ce qu'on vérifie.
   */
  it('met en évidence le quartier cliqué, et l’efface au clic sur le fond', async () => {
    const container = await carte();
    const contours = container.querySelectorAll('path.maioun-quartier');
    fireEvent.click(contours[0] as Element);
    await waitFor(() =>
      expect(container.querySelectorAll('.maioun-quartier-actif')).toHaveLength(1),
    );

    // Un seul à la fois : le second choix remplace le premier.
    fireEvent.click(contours[1] as Element);
    await waitFor(() => {
      const actifs = container.querySelectorAll('.maioun-quartier-actif');
      expect(actifs).toHaveLength(1);
      expect(actifs[0]).toBe(contours[1]);
    });

    fireEvent.click(container.querySelector('.leaflet-container') as Element);
    await waitFor(() =>
      expect(container.querySelectorAll('.maioun-quartier-actif')).toHaveLength(0),
    );
  });

  /**
   * LE POLYGONE NE MANGE PAS LA PASTILLE.
   *
   * Leaflet range les tracés dans son panneau « overlay » et les marqueurs
   * dans le sien, posé par-dessus. Une annonce tombant sur un quartier reste
   * donc cliquable. Si quelqu'un déplaçait les contours vers le panneau des
   * marqueurs, ou les posait après eux, rien ne se verrait — la pastille
   * resterait affichée, simplement inerte. D'où les deux vérifications : le
   * clic ouvre bien l'aperçu, ET l'empilement est le bon.
   */
  it('laisse ouvrir une annonce posée sur un quartier', async () => {
    // Au barycentre d'un quartier qui a un contour : l'annonce est dessus.
    const anneau = DISTRICT_BOUNDARIES.features[0]!.geometry.coordinates[0]![0]!;
    const longitude = anneau.reduce((total, point) => total + point[0], 0) / anneau.length;
    const latitude = anneau.reduce((total, point) => total + point[1], 0) / anneau.length;
    const container = await carte([at('sur-un-quartier', latitude, longitude)]);

    const marqueur = container.querySelector('.leaflet-marker-icon');
    expect(marqueur).not.toBeNull();
    await userEvent.click(marqueur as Element);
    expect(container.querySelector('.leaflet-popup-content')).not.toBeNull();

    // Les contours sont dans le panneau des tracés, les pastilles dans celui
    // des marqueurs, qui vient après — donc au-dessus.
    expect(container.querySelector('.leaflet-overlay-pane path.maioun-quartier')).not.toBeNull();
    expect(container.querySelector('.leaflet-marker-pane .leaflet-marker-icon')).not.toBeNull();
    const panneaux = [...(container.querySelector('.leaflet-map-pane')?.children ?? [])];
    expect(
      panneaux.findIndex((pane) => pane.classList.contains('leaflet-overlay-pane')),
    ).toBeLessThan(panneaux.findIndex((pane) => pane.classList.contains('leaflet-marker-pane')));
  });

  /**
   * SANS SOURIS. Un polygone SVG n'est pas dans l'ordre de tabulation, et
   * l'y mettre ajouterait trente-trois arrêts. La liste déroulante fait le
   * même geste en un seul — et affiche le nom du quartier choisi.
   */
  it('se choisit au clavier par la liste des quartiers', async () => {
    const container = await carte();
    const menu = screen.getByLabelText('Délimiter un quartier') as HTMLSelectElement;
    const premier = DISTRICT_BOUNDARIES.features[0]!.properties.slug;
    await userEvent.selectOptions(menu, premier);
    expect(menu.value).toBe(premier);
    await waitFor(() =>
      expect(container.querySelectorAll('.maioun-quartier-actif')).toHaveLength(1),
    );
    // Les quartiers sans limite publiée ne sont PAS proposés : la liste ne
    // promet que ce qu'elle peut montrer.
    expect(menu.querySelectorAll('option')).toHaveLength(DISTRICT_BOUNDARIES.features.length + 1);
    expect(menu.querySelector('option[value="cimiez"]')).toBeNull();
  });
});
