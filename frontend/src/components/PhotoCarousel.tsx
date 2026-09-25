/**
 * Carrousel de photos d'une carte d'annonce, et sa vue plein écran.
 *
 * Un vrai carrousel — flèches, points et GLISSEMENT du doigt —, pas une barre
 * de défilement : une photo à la fois, navigation explicite.
 *
 * CHAQUE GESTE À SA PLACE. Le glissement latéral est le geste du téléphone ;
 * les flèches sont celui de la souris, et ne s'affichent donc QUE sur grand
 * écran. Superposées à la photo sur un écran tactile, elles mangeaient l'image
 * pour doubler un geste déjà naturel.
 *
 * ET LA SÉRIE A DEUX BOUTS. Le carrousel bouclait : à la dernière photo, un
 * glissement ramenait à la première. Rien ne le disait, et on croyait avoir
 * raté un geste ou vu deux fois la même image. La série s'arrête maintenant à
 * ses extrémités — la flèche s'y éteint, le glissement n'y produit rien.
 *
 * Les images sont affichées directement depuis le site d'origine : jamais
 * téléchargées, jamais stockées, jamais relayées par nous. Une image cassée
 * (retirée côté source) est retirée du carrousel plutôt que d'afficher un cadre
 * vide.
 *
 * SEULES LES PHOTOS PROCHES SONT CHARGÉES. La piste montait toutes les images
 * côte à côte, et `loading="lazy"` ne retient pas celles qui débordent sur le
 * côté : chaque carte téléchargeait sa série entière (vingt photos parfois).
 * On ne monte plus que la photo visible et ses voisines — la seule visible
 * sur une connexion lente —, dans une taille ajustée à l'affichage.
 *
 * LA VIGNETTE NE SUFFIT PAS POUR DÉCIDER. Un logement se juge sur la lumière,
 * l'état d'un mur, ce qu'on voit par la fenêtre : au format d'une carte, on ne
 * voit rien de tout cela. `expandable` ouvre la photo en plein écran, en vue
 * galerie — et seule la FICHE l'active. Sur une carte de liste, toute la
 * surface mène déjà à l'annonce : y ouvrir une galerie volerait le geste
 * principal. La bulle du plan, elle, ne porte qu'une photo et un bouton vers la
 * fiche : une galerie d'une image n'en est pas une, et la fiche est à un clic.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConstrainedNetwork } from '../network-quality.js';
import { PHOTO_WIDTH, photoVariant } from '../photo-variant.js';
import { nextHistoryState } from '../use-route.js';
import { ChevronLeft, ChevronRight, ImageOff, Play, X } from './icons.js';
import { mouvementRefuse } from '../reduced-motion.js';

/** En deçà, c'est une hésitation du doigt, pas une intention de changer de photo. */
const SWIPE_MIN_PX = 40;

/** Refermer la galerie demande un geste plus franc que changer de photo. */
const SWIPE_CLOSE_PX = 90;

/** Un cran de molette envoie une centaine de pixels ; un tremblement, deux. */
const WHEEL_MIN_PX = 24;

/**
 * L'inertie d'un pavé tactile continue d'envoyer des événements longtemps après
 * le doigt. Sans ce silence imposé, un seul geste traversait douze photos.
 */
const WHEEL_QUIET_MS = 320;

/**
 * Flèches : masquées sur téléphone, éteintes au bout de la série.
 *
 * `disabled:opacity-30` plutôt que de les retirer : une flèche qui disparaît
 * décale l'autre et fait sauter la photo. Éteinte, elle dit « c'est le bout »
 * en restant à sa place.
 */
const ARROW =
  'absolute top-1/2 hidden size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white transition-[background-color,opacity] hover:bg-black/65 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-black/45 sm:flex';

/** Même dessin, à la taille du plein écran : la photo occupe tout, la flèche doit se voir. */
const GALLERY_ARROW =
  'absolute top-1/2 hidden size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 transition-[background-color,opacity] hover:bg-black/80 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-black/55 sm:flex';

/**
 * Un rond sombre, lisible sur une photo claire comme sur une photo sombre.
 *
 * Une croix blanche sur un mur blanc disparaît, et une vue plein écran sans
 * sortie visible donne l'impression d'être coincé. D'où le fond opaque et le
 * liseré clair, qui tiennent sur les deux fonds. 44 px : la cible tactile
 * minimale, même quand le dessin fait 20 px.
 */
const GALLERY_CHIP =
  'flex min-h-11 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/25 backdrop-blur-sm';

/** Le niveau de largeur à demander, selon ce que vaut la connexion. */
function level(constrained: boolean): 'constrained' | 'normal' {
  return constrained ? 'constrained' : 'normal';
}

/**
 * La largeur à demander pour une photo qui occupe l'écran entier.
 *
 * ELLE MONTE, MAIS PAS AVEUGLÉMENT. Le plancher est la largeur que le carrousel
 * affiche à l'instant : demander moins ferait TÉLÉCHARGER une image plus floue
 * que celle déjà à l'écran — mesuré, 125 ko dépensés pour afficher moins bien.
 * Le plafond vient de la table partagée : au-delà, les hébergeurs observés
 * agrandissent au lieu de servir mieux. Entre les deux, la largeur réelle de
 * l'écran. Sur un réseau maigre, les deux bornes se rejoignent : la galerie
 * s'ouvre alors sans une requête de plus.
 */
function fullscreenWidth(constrained: boolean, floor: number): number {
  const step = level(constrained);
  if (typeof window === 'undefined') return floor;
  const ratio = window.devicePixelRatio;
  // Au-delà de 2, la densité ne se voit plus mais se paie : ×3 quadruple les octets.
  const density = Math.min(typeof ratio === 'number' && ratio > 0 ? ratio : 1, 2);
  const cap = Math.max(PHOTO_WIDTH.full[step], floor);
  return Math.min(Math.max(Math.ceil(window.innerWidth * density), floor), cap);
}

/**
 * LA VISITE EN VIDÉO, première diapositive de la série.
 *
 * TANT QU'ON NE LA DEMANDE PAS, CE N'EST QU'UNE VIGNETTE. Monter le lecteur
 * d'emblée ferait charger un tiers à chaque ouverture de fiche, pour une vidéo
 * que la plupart ne regarderont pas — et la source saurait qui a ouvert quoi.
 * Au clic, l'iframe remplace la vignette, à la même place.
 *
 * `allowFullScreen` : une visite se regarde en grand, et le plein écran est le
 * geste du lecteur, pas le nôtre.
 */
function VideoSlide({
  url,
  playing,
  onPlay,
  height,
}: {
  readonly url: string;
  readonly playing: boolean;
  readonly onPlay: () => void;
  readonly height: string;
}): React.JSX.Element {
  if (playing) {
    return (
      <iframe
        src={url}
        title="Visite en vidéo"
        allow="fullscreen; autoplay"
        allowFullScreen
        referrerPolicy="no-referrer"
        className={`w-full shrink-0 border-0 bg-black ${height}`}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label="Lire la visite en vidéo"
      className={`flex w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-2 bg-neutral-900 text-white ${height}`}
      onClick={(event) => {
        // Sur une carte de liste, toute la surface mène à la fiche : sans cela,
        // lancer la vidéo naviguerait au lieu de la lire.
        event.stopPropagation();
        onPlay();
      }}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
        <Play aria-hidden="true" className="size-6" />
      </span>
      <span className="text-xs font-medium tracking-wide uppercase">Visite en vidéo</span>
    </button>
  );
}

export function PhotoCarousel({
  urls,
  videoUrl,
  tall = false,
  expandable = false,
  autoAdvanceMs,
}: {
  readonly urls: readonly string[];
  /**
   * La visite en vidéo, en TÊTE de la série — une diapositive comme les autres.
   *
   * Un bouton séparé aurait vécu à côté du carrousel, et c'est dans le
   * carrousel qu'on regarde un logement. Le lecteur n'est monté qu'au clic :
   * ouvrir une fiche ne doit pas charger un lecteur tiers pour tout le monde.
   * Il reste CHEZ LA SOURCE (§11), comme les photos — rien n'est relayé.
   */
  readonly videoUrl?: string;
  /**
   * Format FICHE : plus haut, et sans les marges négatives qui font déborder
   * le carrousel des bords de la carte de liste. La fiche n'a pas de cadre à
   * remplir, elle a une image à montrer.
   */
  readonly tall?: boolean;
  /** Un clic sur la photo ouvre la galerie plein écran. Réservé à la fiche. */
  readonly expandable?: boolean;
  /**
   * DÉFILE TOUT SEUL TANT QUE LE POINTEUR EST DESSUS, à cet intervalle.
   *
   * Pour la LISTE : on y survole une carte après l'autre sans jamais cliquer,
   * et la première photo d'une annonce est souvent la façade — celle qui
   * apprend le moins. Voir la suite sans lever la main change ce qu'on retient
   * d'une carte.
   *
   * Absent sur la FICHE : on y est venu exprès, et une image qui bouge pendant
   * qu'on la regarde est une gêne, pas un service.
   *
   * Il s'arrête net dès que le pointeur part, et ne démarre JAMAIS quand le
   * système demande de limiter les animations : ce mouvement-là n'est pas
   * demandé par qui le subit.
   */
  readonly autoAdvanceMs?: number;
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  // Les URLs dont le chargement échoue sont retirées : le carrousel ne montre
  // que des photos réellement disponibles.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  // Photos dont la déclinaison réduite a échoué : on les montre en taille
  // d'origine avant de les déclarer cassées.
  const [original, setOriginal] = useState<ReadonlySet<string>>(new Set());
  // Photos déjà montées : les garder évite de revoir un cadre vide en revenant.
  const [mounted, setMounted] = useState<ReadonlySet<string>>(new Set());
  // Rang ouvert en plein écran, `null` quand la galerie est fermée.
  const [zoomed, setZoomed] = useState<number | null>(null);
  // Abscisse du doigt au début du geste. Une `ref` et non un état : elle change
  // à chaque touche et ne doit déclencher aucun rendu.
  const swipeFrom = useRef<number | null>(null);
  // Un glissement se termine parfois par un clic, que le navigateur envoie
  // quand même : sans ce drapeau, chaque balayage ouvrirait la galerie.
  const swiped = useRef(false);
  // La photo par laquelle on est entré en plein écran, pour lui rendre le focus.
  const cameFrom = useRef<HTMLButtonElement | null>(null);
  // Lecteur demandé : tant qu'il ne l'est pas, la vidéo n'est qu'une vignette.
  const [playing, setPlaying] = useState(false);
  const constrained = useConstrainedNetwork();
  const photos = urls.filter((url) => !broken.has(url));

  /**
   * La série montrée : la vidéo d'abord, puis les photos.
   *
   * Un DÉCALAGE d'un rang en découle, et la galerie plein écran ne connaît que
   * les photos : c'est `videoOffset` qui traduit l'un dans l'autre. Sans lui,
   * agrandir la deuxième photo en ouvrait une autre.
   */
  const videoOffset = videoUrl !== undefined ? 1 : 0;
  const slides: readonly ({ readonly video: string } | { readonly photo: string })[] = [
    ...(videoUrl !== undefined ? [{ video: videoUrl }] : []),
    ...photos.map((photo) => ({ photo })),
  ];

  /**
   * Le pointeur est-il sur le carrousel ? Un état, et non une classe CSS : le
   * défilement est du comportement, et `:hover` ne se lit pas en JavaScript.
   */
  const [survole, setSurvole] = useState(false);

  /**
   * LE DÉFILEMENT AU SURVOL, et les quatre cas où il se tait.
   *
   * Une seule diapositive : il n'y a rien à faire défiler. La galerie ouverte
   * ou la vidéo lancée : on regarde déjà quelque chose, et le faire glisser
   * sous les yeux serait une nuisance. Le mouvement refusé par le système : ce
   * n'est pas une préférence esthétique.
   *
   * IL BOUCLE, contrairement aux flèches. Celles-ci sont bornées — `go(-1)` sur
   * la première ne fait rien, parce qu'un clic qui ne répond pas se remarque.
   * Ici, s'arrêter sur la dernière laisserait la carte figée sans raison
   * visible ; on revient au début.
   */
  useEffect(() => {
    if (autoAdvanceMs === undefined || !survole) return;
    if (slides.length < 2 || zoomed !== null || playing) return;
    if (mouvementRefuse()) return;
    const minuteur = window.setInterval(() => {
      setIndex((courant) => (courant + 1) % slides.length);
    }, autoAdvanceMs);
    return () => window.clearInterval(minuteur);
  }, [autoAdvanceMs, survole, slides.length, zoomed, playing]);

  /**
   * Les photos voisines du rang courant sont montées.
   *
   * `show` le fait pour les gestes ; le défilement automatique, lui, n'appelle
   * que `setIndex` — sans cet effet, la photo suivante arriverait sur un cadre
   * vide, puisqu'elle n'aurait jamais été demandée.
   */
  useEffect(() => {
    const portee = constrained ? 0 : 1;
    const voisines = photos.filter(
      (_, at) => Math.abs(at + videoOffset - Math.min(index, slides.length - 1)) <= portee,
    );
    setMounted((current) =>
      voisines.every((url) => current.has(url)) ? current : new Set([...current, ...voisines]),
    );
  }, [index, photos, videoOffset, slides.length, constrained]);

  const closeGallery = useCallback((): void => {
    setZoomed(null);
    // `preventScroll` : la piste est en `overflow-hidden`, et rendre le focus à
    // un élément qu'elle cache ferait glisser son contenu hors cadre.
    cameFrom.current?.focus({ preventScroll: true });
    cameFrom.current = null;
  }, []);

  if (slides.length === 0) return <></>;

  const last = slides.length - 1;
  const clamped = Math.min(index, last);
  const reach = constrained ? 0 : 1;
  const inWindow = (at: number): boolean => Math.abs(at - clamped) <= reach;
  const width = PHOTO_WIDTH[tall ? 'detail' : 'card'][level(constrained)];

  const show = (next: number): void => {
    const kept = photos.filter((_, at) => inWindow(at + videoOffset));
    if (kept.some((url) => !mounted.has(url))) {
      setMounted((current) => new Set([...current, ...kept]));
    }
    setIndex(next);
  };
  // Bornée, et non circulaire : `go(-1)` sur la première ne fait rien.
  const go = (next: number): void => show(Math.max(0, Math.min(next, last)));

  const fail = (url: string, src: string): void => {
    if (src !== url && !original.has(url)) {
      setOriginal((current) => new Set(current).add(url));
    } else {
      setBroken((current) => new Set(current).add(url));
    }
  };
  const height = tall ? 'h-64 sm:h-80' : 'h-44';

  return (
    <div
      className={`relative overflow-hidden bg-muted ${
        tall ? 'h-64 w-full sm:h-80' : '-mx-3 -mt-3 mb-3 h-44 w-[calc(100%+1.5rem)]'
      }`}
      // `touch-pan-y` : le geste VERTICAL reste à la page (on continue de faire
      // défiler la liste en partant d'une photo), l'horizontal nous revient.
      style={{ touchAction: 'pan-y' }}
      // LE SURVOL FAIT DÉFILER, quand l'appelant le demande. `onMouseEnter` et
      // non `:hover` : c'est un comportement, pas un style. Le doigt n'en
      // déclenche pas — il n'y a pas de survol au toucher, et une photo qui
      // bouge sous le pouce pendant qu'on lit serait une gêne.
      onMouseEnter={() => setSurvole(true)}
      onMouseLeave={() => setSurvole(false)}
      data-testid="photo-rail"
      onTouchStart={(event) => {
        swipeFrom.current = event.touches[0]?.clientX ?? null;
        swiped.current = false;
      }}
      onTouchEnd={(event) => {
        const from = swipeFrom.current;
        swipeFrom.current = null;
        if (from === null || slides.length < 2) return;
        const delta = (event.changedTouches[0]?.clientX ?? from) - from;
        if (Math.abs(delta) < SWIPE_MIN_PX) return;
        swiped.current = true;
        // Le glissement ne doit pas ouvrir la fiche : toute la carte est
        // cliquable, et un swipe s'y traduirait sinon par une navigation. Vrai
        // AUSSI au bout de la série, où le geste ne change pas de photo : on a
        // glissé, on n'a pas tapé.
        event.stopPropagation();
        // `go` borne : à la première, un glissement vers la droite ne fait
        // rien ; à la dernière, un glissement vers la gauche non plus.
        go(delta < 0 ? clamped + 1 : clamped - 1);
      }}
    >
      {/* Piste : les emplacements côte à côte, décalée par transformation. Les
          photos éloignées n'y sont qu'une case vide, sur le fond neutre. */}
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${clamped * 100}%)` }}
      >
        {slides.map((slide, position) => {
          if ('video' in slide) {
            return (
              <VideoSlide
                key={slide.video}
                url={slide.video}
                playing={playing}
                onPlay={() => setPlaying(true)}
                height={height}
              />
            );
          }
          const at = position - videoOffset;
          const url = slide.photo;
          if (!inWindow(position) && !mounted.has(url)) {
            return <div key={url} aria-hidden="true" className={`w-full shrink-0 ${height}`} />;
          }
          const src = original.has(url) ? url : photoVariant(url, width);
          const image = (classes: string, key?: string): React.JSX.Element => (
            <img
              key={key}
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className={classes}
              onError={() => fail(url, src)}
            />
          );
          if (!expandable) return image(`w-full shrink-0 object-cover ${height}`, url);
          return (
            <button
              key={url}
              type="button"
              aria-label={`Agrandir la photo ${at + 1} sur ${photos.length}`}
              className={`w-full shrink-0 cursor-zoom-in ${height}`}
              onClick={(event) => {
                event.stopPropagation();
                // Le clic fantôme d'un balayage ne doit pas ouvrir la galerie.
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                cameFrom.current = event.currentTarget;
                setZoomed(at);
              }}
            >
              {image('size-full object-cover')}
            </button>
          );
        })}
      </div>

      {slides.length > 1 && (
        <>
          {/* `hidden sm:flex` : la souris seule a besoin de flèches. Sur
            téléphone, le glissement fait le même travail sans rien couvrir. */}
          <button
            type="button"
            aria-label="Photo précédente"
            disabled={clamped === 0}
            onClick={(event) => {
              event.stopPropagation();
              go(clamped - 1);
            }}
            className={`${ARROW} left-1.5`}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Photo suivante"
            disabled={clamped === last}
            onClick={(event) => {
              event.stopPropagation();
              go(clamped + 1);
            }}
            className={`${ARROW} right-1.5`}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>

          {/* Points de position, cliquables. */}
          <div className="absolute right-0 bottom-1.5 left-0 flex justify-center gap-1">
            {slides.map((slide, dot) => (
              <button
                key={'video' in slide ? slide.video : slide.photo}
                type="button"
                aria-label={
                  'video' in slide
                    ? 'Aller à la vidéo'
                    : `Aller à la photo ${dot + 1 - videoOffset}`
                }
                aria-current={dot === clamped}
                onClick={(event) => {
                  event.stopPropagation();
                  show(dot);
                }}
                className={`size-1.5 cursor-pointer rounded-full transition-colors ${
                  dot === clamped ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        </>
      )}

      {zoomed !== null && (
        <PhotoGallery
          urls={photos}
          startAt={Math.min(zoomed, photos.length - 1)}
          // La largeur que le carrousel montre DÉJÀ : c'est elle qui est en
          // cache, et c'est donc elle que la galerie affiche le temps que la
          // grande arrive.
          shownWidth={width}
          onClose={closeGallery}
        />
      )}
    </div>
  );
}

/** Ce qu'on sait d'une déclinaison plein écran : chargée, ou hors service. */
type FullState = ReadonlyMap<string, 'ok' | 'ko'>;

/**
 * La photo, en grand, sur fond noir.
 *
 * L'IMAGE VA JUSQU'AUX BORDS. `max-w-full` ne fait que rétrécir : une photo
 * plus petite que l'écran restait à sa taille, cernée de noir — une fenêtre
 * dans une fenêtre, ce qu'un plein écran doit précisément éviter. Elle occupe
 * donc tout, et `object-contain` la garde ENTIÈRE : une photo d'annonce rognée
 * perd ce qu'on venait y chercher. Seuls la croix, le compteur et les flèches
 * gardent une marge, celle des encoches et des barres système.
 *
 * CE QU'ELLE DOIT SURTOUT NE PAS FAIRE : montrer un écran vide le temps qu'une
 * grande image arrive. On repart donc de la déclinaison que la fiche a DÉJÀ
 * chargée — elle est en cache, elle s'affiche immédiatement —, et la version
 * pleine largeur la remplace quand elle est prête. Même règle à la ROTATION :
 * l'appareil tourné, la photo affichée reste à l'écran pendant que la
 * déclinaison plus large se charge derrière. Sur un réseau maigre, tout cela se
 * confond et rien n'est rechargé.
 *
 * ON NE PRÉCHARGE QUE LES DEUX VOISINES, ET APRÈS COUP. Douze photos en grand à
 * l'ouverture, c'est près de quatre mégaoctets pour onze images que personne ne
 * regardera peut-être ; mesuré, une ouverture en coûte 325 ko. Une avant, une
 * après, et seulement une fois celle qu'on regarde arrivée — elles se
 * disputaient sinon le même lien. Réseau maigre : aucune.
 *
 * La galerie est posée dans `document.body` : ancrée dans le carrousel, elle
 * resterait prisonnière du premier ancêtre animé ou transformé, qui aurait
 * enfermé son `z-index` — c'est exactement le piège qui avait déjà glissé la
 * modale de tri sous la barre d'onglets.
 */
function PhotoGallery({
  urls,
  startAt,
  shownWidth,
  onClose,
}: {
  readonly urls: readonly string[];
  readonly startAt: number;
  /** La largeur déjà affichée par le carrousel, donc déjà dans le cache. */
  readonly shownWidth: number;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [index, setIndex] = useState(startAt);
  const [full, setFull] = useState<FullState>(new Map());
  // La plus grande largeur ARRIVÉE pour chaque photo. C'est elle qu'on affiche :
  // après une rotation, la déclinaison d'avant reste à l'écran le temps que la
  // nouvelle charge, au lieu de retomber sur la vignette de la fiche.
  const [best, setBest] = useState<ReadonlyMap<string, number>>(new Map());
  // Repli d'une photo dont la déclinaison a échoué : l'originale, puis l'aveu.
  const [fallen, setFallen] = useState<ReadonlyMap<string, 'raw' | 'gone'>>(new Map());
  const panel = useRef<HTMLDivElement>(null);
  const touch = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const lastWheel = useRef(0);
  const constrained = useConstrainedNetwork();
  const [width, setWidth] = useState(() => fullscreenWidth(constrained, shownWidth));

  const last = urls.length - 1;
  const at = Math.min(index, last);
  const photo = urls[at]!;
  const big = photoVariant(photo, width);
  const step = fallen.get(photo);
  const arrived = best.get(photo) ?? 0;
  const src = step === 'raw' ? photo : photoVariant(photo, Math.max(arrived, shownWidth));

  const close = useCallback((): void => {
    // Dépiler NOTRE entrée : le « Retour » du téléphone doit refermer la
    // galerie, et la fiche doit rester derrière.
    window.history.back();
    onClose();
  }, [onClose]);

  // L'entrée d'historique de la galerie. Empilée une seule fois, à l'ouverture,
  // avec la profondeur du routeur maison — sans elle, le « Retour » suivant
  // croirait qu'on est arrivé sur la fiche par un lien direct. Le verrou tient
  // compte du double montage de `StrictMode` en développement : deux entrées
  // pour une galerie, et il faudrait appuyer deux fois pour la refermer.
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    window.history.pushState(nextHistoryState(), '', window.location.href);
  }, []);

  // Le bouton « Précédent » et le geste de retour d'Android referment la
  // galerie ; on ne dépile pas une seconde fois, c'est déjà fait.
  useEffect(() => {
    const onPop = (): void => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onClose]);

  // La page derrière ne doit pas défiler sous la galerie : on revenait sinon
  // ailleurs dans la fiche qu'on ne l'avait quittée.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  /**
   * LA ROTATION EST UN AGRANDISSEMENT. Une photo de logement est presque
   * toujours en paysage : tournée, elle passe du tiers de l'écran à l'écran
   * entier, et la déclinaison qui suffisait ne suffit plus.
   *
   * La largeur ne REDESCEND jamais — remettre le téléphone droit rechargerait
   * une image plus petite que celle déjà affichée, pour la montrer moins bien.
   */
  useEffect(() => {
    const resize = (): void =>
      setWidth((current) => Math.max(current, fullscreenWidth(constrained, shownWidth)));
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, [constrained, shownWidth]);

  const go = useCallback(
    (next: number): void => setIndex(Math.max(0, Math.min(next, last))),
    [last],
  );

  /** Les boutons de la galerie, dans l'ordre où la tabulation les visite. */
  const stops = (): readonly HTMLElement[] =>
    panel.current === null
      ? []
      : [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled])')];

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'ArrowRight') go(at + 1);
      else if (event.key === 'ArrowLeft') go(at - 1);
      else if (event.key === 'Home') go(0);
      else if (event.key === 'End') go(last);
      else if (event.key === 'Tab') {
        // LE FOCUS RESTE DANS LA VUE. Sans ce tour, la tabulation continuait
        // derrière la galerie, sur une fiche qu'on ne voit plus.
        const focusable = stops();
        const active = document.activeElement;
        const outside = panel.current !== null && !panel.current.contains(active);
        const first = focusable[0];
        const end = focusable[focusable.length - 1];
        if (first === undefined || end === undefined) {
          event.preventDefault();
          panel.current?.focus();
          return;
        }
        if (event.shiftKey ? outside || active === first : outside || active === end) {
          event.preventDefault();
          (event.shiftKey ? end : first).focus();
        }
        return;
      } else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [at, last, go, close]);

  const settle = (target: string, state: 'ok' | 'ko'): void =>
    setFull((current) => new Map(current).set(target, state));

  /** Retient la plus grande déclinaison arrivée pour cette photo. */
  const keep = (url: string, got: number): void =>
    setBest((current) =>
      (current.get(url) ?? 0) >= got ? current : new Map(current).set(url, got),
    );

  // Ce qu'on garde chaud : la photo regardée, et une de chaque côté. Sur un
  // réseau maigre, rien d'autre que celle qu'on regarde.
  //
  // CELLE QU'ON REGARDE PASSE D'ABORD. Les trois partaient ensemble et se
  // partageaient le même lien ; la seule qui compte est celle qu'on a sous les
  // yeux. Les voisines attendent donc qu'elle soit arrivée — sur une connexion
  // maigre, cela divise d'autant son temps d'attente.
  const reach = constrained ? 0 : 1;
  const served = full.get(big) !== undefined;
  const warm = urls.filter((_, n) => n === at || (served && Math.abs(n - at) <= reach));

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Photos de l’annonce, en plein écran"
      tabIndex={-1}
      className="rf-fade fixed inset-0 z-[2200] flex items-center justify-center overflow-hidden bg-black/95 outline-none"
      style={{
        // La galerie prend les deux axes : le glissement latéral change de
        // photo, le glissement vers le bas referme.
        touchAction: 'none',
        // `dvh` et non la hauteur héritée d'`inset-0` : sur un téléphone, la
        // barre d'adresse se rétracte et se redéploie, et la rotation change
        // tout. `dvh` suit la fenêtre RÉELLEMENT visible, comme la carte.
        height: '100dvh',
      }}
      onTouchStart={(event) => {
        const start = event.touches[0];
        touch.current = start === undefined ? null : { x: start.clientX, y: start.clientY };
      }}
      onTouchEnd={(event) => {
        const from = touch.current;
        touch.current = null;
        const end = event.changedTouches[0];
        if (from === null || end === undefined) return;
        const dx = end.clientX - from.x;
        const dy = end.clientY - from.y;
        if (dy > SWIPE_CLOSE_PX && dy > Math.abs(dx)) {
          close();
          return;
        }
        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
        go(dx < 0 ? at + 1 : at - 1);
      }}
      onWheel={(event) => {
        // Molette verticale ou glissement horizontal du pavé : les deux disent
        // « photo suivante » sur un ordinateur.
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (Math.abs(delta) < WHEEL_MIN_PX) return;
        const now = Date.now();
        if (now - lastWheel.current < WHEEL_QUIET_MS) return;
        lastWheel.current = now;
        go(delta > 0 ? at + 1 : at - 1);
      }}
    >
      {step === 'gone' ? (
        <div role="status" className="flex flex-col items-center gap-2 px-6 text-white/80">
          <ImageOff aria-hidden="true" className="size-8" />
          {/* On le DIT plutôt que de retirer la photo : les rangs glisseraient
              sous les doigts, et « 7 sur 12 » ne voudrait plus rien dire. */}
          <p className="text-center text-[0.95rem]">Cette photo n’a pas pu être chargée.</p>
        </div>
      ) : (
        <img
          key={photo}
          src={src}
          alt={`Photo ${at + 1} sur ${urls.length}`}
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-contain"
          onError={() => {
            // Comme le carrousel : l'originale d'abord, l'aveu ensuite.
            setFallen((current) =>
              new Map(current).set(photo, src !== photo && step === undefined ? 'raw' : 'gone'),
            );
          }}
        />
      )}

      {/* Les images qu'on tient prêtes. Hors écran et sans texte : elles ne
          servent qu'à remplir le cache du navigateur. */}
      {warm.map((url) => {
        const target = photoVariant(url, width);
        if (full.get(target) !== undefined || fallen.get(url) === 'gone') return null;
        return (
          <img
            key={`chaud-${url}`}
            src={target}
            alt=""
            aria-hidden="true"
            decoding="async"
            referrerPolicy="no-referrer"
            className="hidden"
            onLoad={() => {
              settle(target, 'ok');
              keep(url, width);
            }}
            onError={() => settle(target, 'ko')}
          />
        );
      })}

      {/* Le rang, à gauche ; la sortie, à droite. Ils ne se croisent pas, même
          sur un écran de 320 px. Les encoches et la barre d'état sont des
          zones interdites : `env(safe-area-inset-*)` les contourne. */}
      <p
        aria-live="polite"
        aria-atomic="true"
        className={`${GALLERY_CHIP} absolute px-3 text-[0.9rem] tabular-nums`}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          left: 'calc(env(safe-area-inset-left, 0px) + 0.5rem)',
        }}
      >
        <span aria-hidden="true">
          {at + 1} / {urls.length}
        </span>
        <span className="sr-only">
          Photo {at + 1} sur {urls.length}
        </span>
      </p>

      <button
        type="button"
        aria-label="Fermer"
        onClick={close}
        className={`${GALLERY_CHIP} absolute w-11 cursor-pointer hover:bg-black/80`}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          right: 'calc(env(safe-area-inset-right, 0px) + 0.5rem)',
        }}
      >
        <X aria-hidden="true" className="size-5" />
      </button>

      {urls.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Photo précédente"
            disabled={at === 0}
            onClick={() => go(at - 1)}
            className={`${GALLERY_ARROW} left-3`}
          >
            <ChevronLeft aria-hidden="true" className="size-6" />
          </button>
          <button
            type="button"
            aria-label="Photo suivante"
            disabled={at === last}
            onClick={() => go(at + 1)}
            className={`${GALLERY_ARROW} right-3`}
          >
            <ChevronRight aria-hidden="true" className="size-6" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
