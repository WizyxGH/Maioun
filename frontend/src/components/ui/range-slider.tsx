/**
 * Fourchette à deux poignées — le budget, d'un geste.
 *
 * DEUX CHAMPS NUMÉRIQUES DEMANDAIENT DE TAPER. Sur un téléphone, régler un
 * budget ouvrait le clavier, effaçait, retapait ; et rien ne montrait où l'on
 * se situait dans l'échelle des loyers. Une fourchette se règle au pouce et se
 * lit d'un coup d'œil.
 *
 * SANS RADIX, sur lequel shadcn construit le sien : le projet n'en dépend pas.
 * Deux `input[type=range]` NATIFS superposés — chacun est une vraie poignée,
 * donc chacun se déplace au clavier, s'annonce aux lecteurs d'écran et se
 * comporte au doigt comme le contrôle du système. Un panneau scripté perdrait
 * les trois.
 *
 * LES POIGNÉES NE SE CROISENT PAS : chacune s'arrête à l'autre. Un minimum
 * passé au-dessus du maximum donnerait une fourchette vide, donc une liste
 * vide, sans que rien ne l'explique.
 */

import { useId } from 'react';

export interface RangeSliderProps {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly lowValue: number;
  readonly highValue: number;
  readonly onChange: (low: number, high: number) => void;
  readonly lowLabel: string;
  readonly highLabel: string;
  /** Met en forme les bornes affichées au-dessus de la piste. */
  readonly format: (value: number) => string;
}

export function RangeSlider({
  min,
  max,
  step = 1,
  lowValue,
  highValue,
  onChange,
  lowLabel,
  highLabel,
  format,
}: RangeSliderProps): React.JSX.Element {
  const id = useId();
  const span = max - min || 1;
  const leftPercent = ((lowValue - min) / span) * 100;
  const rightPercent = ((highValue - min) / span) * 100;

  /** Classes communes aux deux `range` : piste effacée, poignée conservée. */
  const thumb =
    'pointer-events-none absolute inset-x-0 top-0 h-9 w-full appearance-none bg-transparent ' +
    '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 ' +
    '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer ' +
    '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 ' +
    '[&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-card ' +
    '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-5 ' +
    '[&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full ' +
    '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary ' +
    '[&::-moz-range-thumb]:bg-card focus-visible:outline-none';

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{format(lowValue)}</span>
        <span className="font-medium">{format(highValue)}</span>
      </div>

      <div className="relative h-9">
        {/* La piste, et la portion retenue par-dessus. */}
        <span
          aria-hidden="true"
          className="absolute top-4 right-0 left-0 h-1.5 rounded-full bg-border"
        />
        <span
          aria-hidden="true"
          className="absolute top-4 h-1.5 rounded-full bg-primary"
          style={{ left: `${leftPercent}%`, right: `${100 - rightPercent}%` }}
        />

        <input
          id={`${id}-low`}
          type="range"
          aria-label={lowLabel}
          min={min}
          max={max}
          step={step}
          value={lowValue}
          onChange={(event) => onChange(Math.min(Number(event.target.value), highValue), highValue)}
          className={thumb}
        />
        <input
          id={`${id}-high`}
          type="range"
          aria-label={highLabel}
          min={min}
          max={max}
          step={step}
          value={highValue}
          onChange={(event) => onChange(lowValue, Math.max(Number(event.target.value), lowValue))}
          className={thumb}
        />
      </div>
    </div>
  );
}
