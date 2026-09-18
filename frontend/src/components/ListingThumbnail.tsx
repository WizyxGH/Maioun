/**
 * Vignette carrée d'une annonce, dans une taille à sa mesure.
 *
 * Une vignette de 56 px chargeait la photo entière — souvent 1600 px. On
 * demande une déclinaison réduite, l'originale si celle-ci échoue, et on
 * masque le cadre si l'originale échoue aussi.
 *
 * ELLE PASSE PAR LE RELAIS, comme la carte et la fiche. Sans lui, une photo
 * servie en HTTP clair — BEP en sert — est bloquée par le navigateur sur un
 * site en HTTPS : l'image ne s'affichait pas dans l'historique des alertes, et
 * rien ne disait pourquoi.
 */

import { useState } from 'react';
import { photoVariant } from '../photo-variant.js';
import { splitPhotos } from '../photos.js';

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
  // Une photo en HTTP clair devient son adresse relayée ; sans relais possible,
  // `splitPhotos` la range en « ouvrable seulement » et le cadre reste vide.
  const embeddable = splitPhotos([url]).embeddable[0] ?? null;
  const variant = embeddable === null ? null : photoVariant(embeddable, THUMBNAIL_WIDTH);
  const src = stage === 'variant' ? (variant ?? '') : (embeddable ?? '');
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`${className} ${stage === 'broken' || embeddable === null ? 'invisible' : ''}`}
      onError={() =>
        setStage(stage === 'variant' && variant !== embeddable ? 'original' : 'broken')
      }
    />
  );
}
