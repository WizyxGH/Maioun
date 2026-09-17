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

/**
 * Retrait, en pixels, entre le bord de la piste et le point le plus extrême
 * qu'un CENTRE de poignée atteint.
 *
 * LA PORTION RETENUE NE TOMBAIT PAS EN FACE DES POIGNÉES : elle se plaçait en
 * pourcentage de la largeur ENTIÈRE, alors que le centre d'une poignée s'arrête
 * à une demi-poignée du bord, plus le retrait que le navigateur ménage autour
 * de la piste. À 360 px et au budget d'ouverture, le bandeau coloré débordait à
 * gauche du minimum et s'arrêtait 19 px avant le maximum.
 *
 * Valeur MESURÉE sous Chrome pour cette poignée, en la tirant d'un nombre connu
 * de pixels. L'histogramme se cale sur le même retrait.
 */
const HANDLE_INSET_PX = 18;

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
  /**
   * Répartition des valeurs, dessinée en barres au-dessus de la piste : on voit
   * ce qu'élargir la fourchette ferait gagner avant de déplacer une poignée.
   */
  readonly histogram?: readonly HistogramBucket[] | undefined;
  /** Phrase lue par les lecteurs d'écran à la place des barres. */
  readonly describeHistogram?: ((inRange: number, total: number) => string) | undefined;
}

export interface HistogramBucket {
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

/** Une tranche est « retenue » quand son milieu tombe dans la fourchette. */
export function bucketInRange(bucket: HistogramBucket, low: number, high: number): boolean {
  const middle = (bucket.from + bucket.to) / 2;
  return middle >= low && middle <= high;
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
  histogram,
  describeHistogram,
}: RangeSliderProps): React.JSX.Element {
  const id = useId();
  const span = max - min || 1;
  const leftPercent = ((lowValue - min) / span) * 100;
  const rightPercent = ((highValue - min) / span) * 100;
  const bars = histogram ?? [];
  const tallest = Math.max(0, ...bars.map((bucket) => bucket.count));
  const total = bars.reduce((sum, bucket) => sum + bucket.count, 0);
  const inRange = bars
    .filter((bucket) => bucketInRange(bucket, lowValue, highValue))
    .reduce((sum, bucket) => sum + bucket.count, 0);

  /**
   * QUAND LES DEUX BORNES SE REJOIGNENT, LES POIGNÉES SE SUPERPOSENT et seule
   * celle du dessus reste saisissable. En HAUT DE L'ÉCHELLE elle n'a plus où
   * aller — le maximum ne descend pas sous le minimum, déjà au maximum : à 2500
   * – 2500, ni le doigt ni la flèche gauche ne rouvraient la fourchette, seul
   * « Réinitialiser » s'en sortait.
   *
   * On fait donc passer devant la poignée qui peut ENCORE bouger. Sans coût le
   * reste du temps : seules les poignées reçoivent le pointeur.
   */
  const lowOnTop = lowValue >= highValue && lowValue > min;

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

      {tallest > 0 && (
        <>
          {/* Placées sur la même échelle que les poignées, pour qu'une barre
            soit exactement au-dessus des loyers qu'elle compte. */}
          <div
            aria-hidden="true"
            data-testid="range-histogram"
            className="relative h-12"
            style={{ paddingInline: HANDLE_INSET_PX }}
          >
            <div className="relative h-full">
              {bars.map((bucket) => {
                const left = ((Math.max(bucket.from, min) - min) / span) * 100;
                const width =
                  ((Math.min(bucket.to, max) - Math.max(bucket.from, min)) / span) * 100;
                const selected = bucketInRange(bucket, lowValue, highValue);
                return (
                  <span
                    key={bucket.from}
                    data-selected={selected}
                    className={`absolute bottom-0 rounded-t-[2px] ${selected ? 'bg-primary' : 'bg-muted-foreground/25'}`}
                    style={{
                      left: `calc(${left}% + 1px)`,
                      width: `max(1px, calc(${width}% - 2px))`,
                      // Une tranche non vide reste visible, même minuscule.
                      height:
                        bucket.count === 0 ? 0 : `max(2px, ${(bucket.count / tallest) * 100}%)`,
                    }}
                  />
                );
              })}
            </div>
          </div>
          {describeHistogram !== undefined && (
            <p className="sr-only">{describeHistogram(inRange, total)}</p>
          )}
        </>
      )}

      <div className="relative h-9">
        {/* La piste, et la portion retenue par-dessus. Toutes deux dans le
          retrait des poignées : c'est là que leurs centres se déplacent. */}
        <span
          aria-hidden="true"
          className="absolute top-4 h-1.5"
          style={{ left: HANDLE_INSET_PX, right: HANDLE_INSET_PX }}
        >
          <span className="absolute inset-0 rounded-full bg-border" />
          <span
            className="absolute inset-y-0 rounded-full bg-primary"
            style={{ left: `${leftPercent}%`, right: `${100 - rightPercent}%` }}
          />
        </span>

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
          style={{ zIndex: lowOnTop ? 2 : 1 }}
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
          style={{ zIndex: lowOnTop ? 1 : 2 }}
        />
      </div>
    </div>
  );
}
