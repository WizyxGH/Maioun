/**
 * Les barres au-dessus du budget : celles de la fourchette ressortent, les
 * autres restent là pour montrer ce qu'élargir apporterait.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { bucketInRange, RangeSlider } from './range-slider.js';

const buckets = [
  { from: 200, to: 300, count: 1 },
  { from: 300, to: 400, count: 4 },
  { from: 400, to: 500, count: 0 },
  { from: 500, to: 600, count: 2 },
];

const slider = (histogram?: typeof buckets) =>
  render(
    <RangeSlider
      min={200}
      max={600}
      lowValue={300}
      highValue={500}
      onChange={() => undefined}
      lowLabel="Loyer minimum"
      highLabel="Loyer maximum"
      format={(value) => `${value} €`}
      histogram={histogram}
      describeHistogram={(inRange, total) => `${inRange} sur ${total}`}
    />,
  );

describe('RangeSlider — histogramme', () => {
  it('retient une tranche dont le milieu est dans la fourchette', () => {
    expect(bucketInRange({ from: 300, to: 400, count: 0 }, 300, 500)).toBe(true);
    expect(bucketInRange({ from: 200, to: 300, count: 0 }, 300, 500)).toBe(false);
    expect(bucketInRange({ from: 500, to: 600, count: 0 }, 300, 500)).toBe(false);
  });

  it('met en avant les barres de la fourchette, et les cache aux lecteurs d’écran', () => {
    slider(buckets);
    const chart = screen.getByTestId('range-histogram');
    expect(chart.getAttribute('aria-hidden')).toBe('true');
    const bars = [...chart.querySelectorAll('[data-selected]')];
    expect(bars.map((bar) => bar.getAttribute('data-selected'))).toEqual([
      'false',
      'true',
      'true',
      'false',
    ]);
    // La plus haute tranche occupe toute la hauteur.
    expect((bars[1] as HTMLElement).style.height).toContain('100%');
    // Le résumé textuel compte ce que la fourchette retient.
    expect(screen.getByText('4 sur 7')).toBeTruthy();
  });

  it('ne dessine rien sans données', () => {
    slider();
    expect(screen.queryByTestId('range-histogram')).toBeNull();
    slider(buckets.map((bucket) => ({ ...bucket, count: 0 })));
    expect(screen.queryByTestId('range-histogram')).toBeNull();
  });
});
