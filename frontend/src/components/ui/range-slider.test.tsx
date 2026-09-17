/**
 * Les barres au-dessus du budget : celles de la fourchette ressortent, les
 * autres restent là pour montrer ce qu'élargir apporterait.
 *
 * Et la fourchette elle-même : deux poignées superposées ne doivent jamais
 * enfermer l'utilisateur dans un réglage qu'il ne peut plus défaire.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

/** La fourchette seule, aux bornes du budget réel, sans histogramme. */
function budget(lowValue: number, highValue: number, onChange = (): void => undefined) {
  return render(
    <RangeSlider
      min={200}
      max={2500}
      step={25}
      lowValue={lowValue}
      highValue={highValue}
      onChange={onChange}
      lowLabel="Loyer minimum"
      highLabel="Loyer maximum"
      format={(value) => `${value} €`}
    />,
  );
}

/** Rang d'empilement des deux poignées : la plus grande valeur est devant. */
function stacking(): { readonly low: number; readonly high: number } {
  return {
    low: Number(screen.getByLabelText('Loyer minimum').style.zIndex),
    high: Number(screen.getByLabelText('Loyer maximum').style.zIndex),
  };
}

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

describe('RangeSlider — poignées superposées', () => {
  it('laisse la poignée du maximum devant tant qu’elle peut bouger', () => {
    budget(250, 700);
    const { low, high } = stacking();
    expect(high).toBeGreaterThan(low);
  });

  it('fait passer le minimum devant quand les deux bornes se rejoignent', () => {
    // EN HAUT DE L'ÉCHELLE, le maximum n'a plus où aller : il ne peut pas
    // descendre sous le minimum, qui est déjà au maximum. Si la poignée du
    // maximum reste devant, elle masque l'autre et la fourchette se bloque —
    // au doigt comme à la flèche gauche.
    budget(2500, 2500);
    const { low, high } = stacking();
    expect(low).toBeGreaterThan(high);
  });

  it('rouvre la fourchette bloquée en haut de l’échelle', () => {
    const onChange = vi.fn();
    budget(2500, 2500, onChange);
    fireEvent.change(screen.getByLabelText('Loyer minimum'), { target: { value: '1000' } });
    expect(onChange).toHaveBeenCalledWith(1000, 2500);
  });

  it('garde le maximum devant en bas de l’échelle, où c’est lui qui peut bouger', () => {
    budget(200, 200);
    const { low, high } = stacking();
    expect(high).toBeGreaterThan(low);
  });
});
