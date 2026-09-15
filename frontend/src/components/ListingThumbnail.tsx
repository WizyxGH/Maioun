/**
 * Vignette carrée d'une annonce, dans une taille à sa mesure.
 *
 * Une vignette de 56 px chargeait la photo entière — souvent 1600 px. On
 * demande une déclinaison réduite, l'originale si celle-ci échoue, et on
 * masque le cadre si l'originale échoue aussi.
 */

import { useState } from 'react';
import { photoVariant } from '../photo-variant.js';

/** ~56 px affichés sur un écran à densité 3, côté court compris. */
const THUMBNAIL_WIDTH = 200;

export function ListingThumbnail({
  url,
  className,
}: {
  readonly url: string;
  readonly className: string;
}): React.JSX.Element {
  const [stage, setStage] = useState<'variant' | 'original' | 'broken'>('variant');
  const variant = photoVariant(url, THUMBNAIL_WIDTH);
  const src = stage === 'variant' ? variant : url;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`${className} ${stage === 'broken' ? 'invisible' : ''}`}
      onError={() => setStage(stage === 'variant' && variant !== url ? 'original' : 'broken')}
    />
  );
}
