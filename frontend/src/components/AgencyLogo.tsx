/**
 * Le logo d'une agence, quand on le connaît vraiment.
 *
 * TOUTES LES AGENCES PORTAIENT LA MÊME ICÔNE, ce qui ne distinguait rien : une
 * liste de quarante lignes identiques à gauche du nom. Le logo est le repère le
 * plus rapide — on reconnaît son agence avant d'avoir lu.
 *
 * ON NE L'INVENTE PAS. Deux conditions, et il en fallait bien deux :
 *
 *   1. la source doit être le SITE PROPRE d'une agence — pour un portail comme
 *      FNAIM ou Studapart, le domaine est celui du portail, et l'afficher
 *      donnerait le même logo à des dizaines d'agences différentes ;
 *   2. le nom doit désigner LA MÊME AGENCE, prouvé par la règle de
 *      rapprochement partagée avec le collecteur — celle qui se tait dès que
 *      deux sources se disputent un nom.
 *
 * Un logo faux est pire qu'une icône neutre : on le croit.
 *
 * L'image n'est ni téléchargée ni réhébergée, seulement pointée. Elle vient du
 * site de l'agence, comme les photos d'annonces.
 */

import { useState } from 'react';
import { Agency } from './icons.js';
import { SOURCES } from '../sources.generated.js';
import { agencySourceId } from '../agency-coverage.js';

/**
 * La source dont on peut porter le logo et l'adresse sous ce nom, ou `null`.
 *
 * LE RAPPROCHEMENT ÉTAIT FAIT ICI, et il était faible : deux formes comparables
 * dont l'une contient l'autre, à partir de cinq caractères. « L'Agence »
 * entrait ainsi dans « L'Agence du Centre », et l'adresse d'une maison pouvait
 * se coller sous le nom d'une autre. C'est maintenant la règle du collecteur
 * qui répond, celle qui se tait dès que deux sources se disputent un nom.
 *
 * ET ON NE REGARDE PLUS D'OÙ VIENT L'ANNONCE. On cherchait le logo parmi les
 * seules sources ayant publié CETTE annonce : une agence que nous collectons,
 * mais dont l'annonce n'était arrivée que par un portail, restait sous l'icône
 * neutre. Or la question n'est pas « d'où vient cette annonce » mais « à qui
 * est ce nom » — et la réponse ne dépend pas du chemin qu'a pris le bien.
 * Cent huit graphies gagnent un logo ainsi, soixante et une une adresse.
 *
 * `kind` décide seul de l'affichage : le domaine d'un portail donnerait la même
 * image à des dizaines d'agences distinctes.
 */
function ownSource(name: string): { readonly logo: string | null; readonly domain: string } | null {
  const id = agencySourceId(name);
  if (id === null) return null;
  const source = SOURCES[id];
  if (source === undefined || source.kind !== 'localAgency' || source.domain === null) return null;
  return { logo: source.logo, domain: source.domain };
}

/** Le logo d'une agence, quand la source qui la collecte est nommable. */
export function agencyLogoUrl(name: string): string | null {
  const source = ownSource(name);
  if (source === null) return null;
  // L'ADRESSE DÉCLARÉE D'ABORD. Quarante-neuf agences sur cent quatre-vingt-neuf
  // ne servent rien à /favicon.ico : elles pointaient vers une image
  // inexistante, et l'écran retombait sur l'icône neutre alors que leur logo
  // est public, à l'adresse que leur site déclare lui-même.
  return source.logo ?? `https://${source.domain}/favicon.ico`;
}

/**
 * L'adresse de vitrine d'une agence, sous la même règle que le logo. Dans le
 * doute, rien : l'adresse d'une autre maison enverrait frapper à la mauvaise
 * porte.
 */
export function agencyAddress(name: string): string | null {
  const id = agencySourceId(name);
  const address = id === null ? null : SOURCES[id]?.address;
  if (address == null) return null;
  return `${address.street}, ${address.postalCode} ${address.city}`;
}

export function AgencyLogo({
  name,
  className = 'size-5',
}: {
  readonly name: string;
  readonly className?: string;
}): React.JSX.Element {
  const logo = agencyLogoUrl(name);
  // Une image qui ne charge pas laisserait un carré vide, plus laid que
  // l'icône qu'elle remplace : on repasse à celle-ci.
  const [broken, setBroken] = useState(false);

  if (logo === null || broken) {
    return <Agency aria-hidden="true" className={`text-muted-foreground shrink-0 ${className}`} />;
  }

  return (
    <img
      src={logo}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setBroken(true)}
      title={name}
      className={`shrink-0 rounded object-contain ${className}`}
    />
  );
}
