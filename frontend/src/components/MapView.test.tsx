/**
 * Le fond de carte se choisit et se retient ; les marqueurs ne bougent pas.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapView, { readMapStyle } from './MapView.js';

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
