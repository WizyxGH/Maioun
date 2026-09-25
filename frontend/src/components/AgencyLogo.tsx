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

import { useEffect, useRef, useState } from 'react';
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
  return id === null ? null : parSonIdentifiant(id);
}

/**
 * La source qui a le droit de prêter son image à ce nom.
 *
 * LA QUESTION N'EST PAS LE GENRE DE LA SOURCE, C'EST QUI PUBLIE. Trois cas ont
 * ce droit, et un ne l'a pas :
 *
 *   - une AGENCE LOCALE : c'est son site, c'est son logo ;
 *   - un RÉSEAU — Century 21, Orpi, Laforêt, ERA : ses annonces viennent de ses
 *     franchises, qui portent toutes cette marque. « CENTURY 21 Lafage
 *     Transactions » EST une Century 21. Mesuré le 2026-09-25 : Orpi nomme
 *     16 agences, toutes des Orpi ; Century 21 en nomme 7, toutes des Century
 *     21 ;
 *   - un portail qui publie EN PROPRE, déclaré tel quel : Studapart nomme UNE
 *     agence sur ses 201 annonces, elle-même ;
 *   - un RELAIS, non : Bien'ici nomme 175 agences tierces, la FNAIM 56,
 *     ParuVendu 37. Leur coller la marque du portail mettrait l'enseigne de
 *     l'un sur l'annonce de l'autre.
 *
 * Un logo faux est pire qu'une icône neutre : on le croit.
 */
function parSonIdentifiant(
  id: string,
): { readonly logo: string | null; readonly domain: string } | null {
  const source = SOURCES[id];
  if (source === undefined || source.domain === null) return null;
  const aLeDroit =
    source.kind === 'localAgency' || source.kind === 'agencyNetwork' || source.publishesOwnListings;
  return aLeDroit ? { logo: source.logo, domain: source.domain } : null;
}

/**
 * La source comme SITE, quel que soit son genre.
 *
 * Un portail n'a pas le droit de prêter son image à une agence — c'est la règle
 * de `parSonIdentifiant`, et elle ne bouge pas. Mais quand l'écran nomme LA
 * SOURCE, l'image du portail est la sienne : Studapart sur une annonce
 * Studapart n'usurpe l'identité de personne.
 *
 * Reste la raison qui les avait exclus : « une file de pictogrammes
 * identiques ». Elle visait l'icône NEUTRE de repli, servie à tous ceux qui
 * n'ont pas de logo — pas leur marque, qui les distingue. `neutre` la supprime
 * (voir `Image`), et seuls les portails qui servent vraiment une image
 * s'affichent : quatre sur huit au relevé du 2026-09-25, les autres ne rendant
 * ni icône ni 404 exploitable.
 */
function parSonSite(id: string): { readonly logo: string | null; readonly domain: string } | null {
  const source = SOURCES[id];
  if (source === undefined || source.domain === null) return null;
  // TOUTES LES SOURCES N'ONT PAS DE SITE : les alertes e-mail déclarent
  // « imap » pour domaine, et `https://imap/favicon.ico` n'est l'adresse de
  // rien. Un point, au moins, sinon ce n'est pas un hôte.
  if (!source.domain.includes('.')) return null;
  return { logo: source.logo, domain: source.domain };
}

/** L'image d'une source, ou `null` si ce n'est pas le site propre d'une agence. */
function adresseDuLogo(source: { readonly logo: string | null; readonly domain: string }): string {
  // L'ADRESSE DÉCLARÉE D'ABORD. Quarante-neuf agences sur cent quatre-vingt-neuf
  // ne servent rien à /favicon.ico : elles pointaient vers une image
  // inexistante, et l'écran retombait sur l'icône neutre alors que leur logo
  // est public, à l'adresse que leur site déclare lui-même.
  return source.logo ?? `https://${source.domain}/favicon.ico`;
}

/** Le logo d'une agence, quand la source qui la collecte est nommable. */
export function agencyLogoUrl(name: string): string | null {
  const source = ownSource(name);
  return source === null ? null : adresseDuLogo(source);
}

/**
 * Le logo d'une SOURCE désignée par son identifiant.
 *
 * La carte d'annonce connaît l'identifiant, elle n'a donc pas à repasser par
 * le rapprochement de noms — qui se tait, à raison, dès qu'un nom est disputé.
 */
export function sourceLogoUrl(sourceId: string): string | null {
  const source = parSonSite(sourceId);
  return source === null ? null : adresseDuLogo(source);
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
  return <Image url={agencyLogoUrl(name)} title={name} className={className} />;
}

/**
 * Le même repère, pour une source qu'on tient par son identifiant.
 *
 * `neutre` permet de ne RIEN afficher faute de logo : sur la ligne de sources
 * d'une carte, une icône générique par portail ferait une file de pictogrammes
 * identiques là où le nom suffit.
 */
export function SourceLogo({
  sourceId,
  name,
  className = 'size-4',
  neutre = true,
}: {
  readonly sourceId: string;
  readonly name: string;
  readonly className?: string;
  readonly neutre?: boolean;
}): React.JSX.Element | null {
  const url = sourceLogoUrl(sourceId);
  if (url === null && !neutre) return null;
  return <Image url={url} title={name} className={className} neutre={neutre} />;
}

/**
 * L'image, et le repli sur l'icône neutre.
 *
 * ELLE N'EST DEMANDÉE QU'UNE FOIS À L'ÉCRAN, et c'est indispensable : chaque
 * logo vit sur le domaine de SON agence, donc une liste de cinquante annonces
 * ouvrait cinquante connexions vers cinquante hôtes distincts — résolution DNS
 * et poignée TLS comprises. Mesuré sur les scénarios end-to-end : 24 s sans les
 * logos, 55 s avec, et un test tombé en chemin.
 *
 * `loading="lazy"` ne suffisait pas : le navigateur anticipe largement, et
 * toutes les cartes sont dans le document. Rien n'est réhébergé pour autant —
 * l'image est pointée, comme les photos d'annonces.
 */
function Image({
  url,
  title,
  className,
  neutre = true,
}: {
  readonly url: string | null;
  readonly title: string;
  readonly className: string;
  /**
   * `false` : rien du tout plutôt que l'icône neutre — y compris quand l'image
   * ne charge pas. Sans ce dernier point, un portail qui ne sert pas de
   * favicon rendait le pictogramme générique APRÈS coup, et la file d'icônes
   * identiques revenait par la fenêtre.
   */
  readonly neutre?: boolean;
}): React.JSX.Element | null {
  // Une image qui ne charge pas laisserait un carré vide, plus laid que
  // l'icône qu'elle remplace : on repasse à celle-ci.
  const [broken, setBroken] = useState(false);
  // Hors navigateur — tests unitaires, rendu serveur — on ne diffère rien :
  // il n'y a alors ni défilement ni requête à épargner.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const place = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (visible || place.current === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      // Un peu avant l'entrée réelle : le logo est là quand l'œil arrive.
      { rootMargin: '200px' },
    );
    observer.observe(place.current);
    return () => observer.disconnect();
  }, [visible]);

  if (url === null || broken) {
    if (!neutre) return null;
    return <Agency aria-hidden="true" className={`text-muted-foreground shrink-0 ${className}`} />;
  }

  if (!visible) {
    return <span ref={place} aria-hidden="true" className={`inline-block shrink-0 ${className}`} />;
  }

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      title={title}
      className={`shrink-0 rounded object-contain ${className}`}
    />
  );
}
