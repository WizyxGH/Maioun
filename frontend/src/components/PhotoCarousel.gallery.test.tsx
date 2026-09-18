/**
 * La vue galerie plein écran : ouverture, gestes, focus, poids des images.
 *
 * Les photos viennent d'un hébergeur dont on sait décliner les tailles
 * (`staticlbi`) : c'est le seul moyen de VÉRIFIER que la qualité monte en plein
 * écran, et qu'elle ne monte pas sur un réseau maigre.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoCarousel } from './PhotoCarousel.js';

const SERIES = Array.from(
  { length: 12 },
  (_, at) => `https://agence.staticlbi.com/1600xauto/images/biens/${at + 1}/p.jpg`,
);
const variant = (at: number, width: number): string =>
  `https://agence.staticlbi.com/${width}xauto/images/biens/${at + 1}/p.jpg`;

/** La largeur demandée par la FICHE, celle que la galerie retrouve en cache. */
const FICHE = 1200;
/** Largeur d'écran des tests : au-dessus de la fiche, donc la galerie monte. */
const SCREEN = 1440;

function openGallery(): HTMLElement {
  fireEvent.click(screen.getByLabelText('Agrandir la photo 1 sur 12'));
  return screen.getByRole('dialog');
}

/** Les `src` des images de la galerie, dans l'ordre du DOM. */
const galleryImages = (dialog: HTMLElement): string[] =>
  [...dialog.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');

beforeEach(() => {
  window.history.replaceState({ depth: 1 }, '', '/listing/demo%3A1');
  Object.defineProperty(window, 'innerWidth', { value: SCREEN, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'connection');
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
});

describe('PhotoCarousel — ouverture de la galerie', () => {
  it('n’ouvre rien depuis une carte de liste : le clic y appartient à l’annonce', () => {
    render(<PhotoCarousel urls={SERIES} />);
    expect(screen.queryByLabelText(/Agrandir la photo/)).not.toBeInTheDocument();
  });

  it('ouvre le plein écran au clic sur la photo de la fiche et annonce le rang', () => {
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Photo 1 sur 12')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Fermer')).toBeInTheDocument();
  });

  it('suit la position au clavier et la redit à chaque fois', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(within(dialog).getByText('Photo 3 sur 12')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('Photo 2 sur 12')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(within(dialog).getByText('Photo 12 sur 12')).toBeInTheDocument();
    // Le bout de la série est un bout, ici aussi.
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('Photo 12 sur 12')).toBeInTheDocument();
  });
});

describe('PhotoCarousel — fermeture de la galerie', () => {
  it('se referme sur Échap', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    openGallery();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('se referme par la croix', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();
    await user.click(within(dialog).getByLabelText('Fermer'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('empile une entrée d’historique, que le bouton « Retour » dépile', () => {
    const before = window.history.state as { readonly depth: number };
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    openGallery();
    // Le « Retour » du téléphone doit refermer la galerie, pas quitter la fiche.
    expect((window.history.state as { readonly depth: number }).depth).toBe(before.depth + 1);

    fireEvent.popState(window);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rend le focus à la photo par laquelle on est entré', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const origin = screen.getByLabelText('Agrandir la photo 1 sur 12');
    fireEvent.click(origin);
    // Le focus entre dans la vue, sinon la tabulation continuerait derrière.
    expect(screen.getByRole('dialog')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(origin).toHaveFocus();
  });

  it('garde la tabulation dans la vue', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();
    const stops = [...dialog.querySelectorAll('button')];

    stops[stops.length - 1]!.focus();
    await user.tab();
    expect(stops[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(stops[stops.length - 1]).toHaveFocus();
  });
});

describe('PhotoCarousel — gestes de la galerie', () => {
  /** Un glissement du doigt de (`dx`, `dy`) pixels. */
  function swipe(element: HTMLElement, dx: number, dy: number): void {
    fireEvent.touchStart(element, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchEnd(element, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
  }

  it('change de photo au balayage horizontal, et s’arrête au premier', () => {
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();

    swipe(dialog, -120, 0);
    expect(within(dialog).getByText('Photo 2 sur 12')).toBeInTheDocument();
    swipe(dialog, 120, 0);
    expect(within(dialog).getByText('Photo 1 sur 12')).toBeInTheDocument();
    swipe(dialog, 120, 0);
    expect(within(dialog).getByText('Photo 1 sur 12')).toBeInTheDocument();
  });

  it('se referme au balayage vers le bas', () => {
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    swipe(openGallery(), 0, 150);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('avance d’une seule photo par coup de molette, inertie comprise', () => {
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();

    fireEvent.wheel(dialog, { deltaY: 120 });
    expect(within(dialog).getByText('Photo 2 sur 12')).toBeInTheDocument();
    // La traîne du pavé tactile ne doit pas traverser la série.
    fireEvent.wheel(dialog, { deltaY: 80 });
    fireEvent.wheel(dialog, { deltaY: 40 });
    expect(within(dialog).getByText('Photo 2 sur 12')).toBeInTheDocument();
    // Un frôlement n'est pas un geste.
    fireEvent.wheel(dialog, { deltaY: 4 });
    expect(within(dialog).getByText('Photo 2 sur 12')).toBeInTheDocument();
  });

  it('n’ouvre pas la galerie sur le clic fantôme d’un balayage', () => {
    const { container } = render(<PhotoCarousel urls={SERIES} tall expandable />);
    const track = container.firstElementChild as HTMLElement;
    fireEvent.touchStart(track, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(track, { changedTouches: [{ clientX: 60 }] });
    fireEvent.click(screen.getByLabelText('Agrandir la photo 2 sur 12'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PhotoCarousel — qualité et poids en plein écran', () => {
  it('montre d’abord la déclinaison déjà chargée, puis la remplace par la grande', () => {
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();
    const [shown, ...warm] = galleryImages(dialog);

    // JAMAIS d'écran blanc : ce qu'on affiche à l'ouverture est l'image que la
    // fiche a déjà téléchargée.
    expect(shown).toBe(variant(0, FICHE));
    // Plus grande que la vignette de la fiche, et ELLE SEULE : la voisine
    // attend son tour pour ne pas lui disputer la bande passante.
    expect(warm).toEqual([variant(0, SCREEN)]);

    fireEvent.load(dialog.querySelectorAll('img')[1]!);
    expect(galleryImages(dialog)[0]).toBe(variant(0, SCREEN));
    expect(galleryImages(dialog)).toContain(variant(1, SCREEN));
  });

  it('ne tient chaud que la précédente et la suivante, jamais les douze', () => {
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();
    const touchees = new Set<number>();
    /** Les rangs de photo que la galerie a demandés jusqu'ici. */
    const relever = (): void => {
      for (const src of galleryImages(dialog)) {
        touchees.add(Number(/\/biens\/(\d+)\//.exec(src)?.[1] ?? 0));
      }
    };

    // On avance de deux, en laissant chaque grande image arriver.
    relever();
    for (let n = 0; n < 2; n += 1) {
      [...dialog.querySelectorAll('img')].forEach((img) => fireEvent.load(img));
      relever();
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      relever();
    }
    [...dialog.querySelectorAll('img')].forEach((img) => fireEvent.load(img));
    relever();

    // Trois photos regardées, quatre demandées : jamais plus loin que la
    // voisine. Les rangs 5 à 12 n'ont jamais quitté la fiche.
    expect([...touchees].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(within(dialog).getByText('Photo 3 sur 12')).toBeInTheDocument();
  });

  it('ne précharge rien et plafonne l’agrandissement sur un réseau maigre', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '3g' },
      configurable: true,
    });
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();
    // 800 px : ce que la fiche affiche sur un lien maigre, donc ce qui est en
    // cache. On monte jusqu'au plafond « réseau maigre » et pas jusqu'aux
    // 1440 px de l'écran — et aucune voisine n'est tenue chaude.
    expect(galleryImages(dialog)).toEqual([variant(0, 800), variant(0, 1000)]);
  });

  it('ne demande RIEN de plus quand l’écran du téléphone n’en réclame pas', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '3g' },
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    // 390 px de large : les 800 px de la fiche couvrent déjà l'écran, même à
    // densité 2. La galerie s'ouvre sur l'image déjà chargée, sans une requête.
    expect(new Set(galleryImages(openGallery()))).toEqual(new Set([variant(0, 800)]));
  });

  it('occupe tout l’écran, sans marge et sans rogner', () => {
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();
    const image = dialog.querySelector('img')!;
    // `size-full` et non `max-w-full` : une photo plus petite que l'écran
    // laissait une bande noire tout autour — une fenêtre dans une fenêtre.
    expect(image.className).toContain('size-full');
    // Entière, jamais rognée : une photo d'annonce coupée perd ce qu'on
    // venait y chercher.
    expect(image.className).toContain('object-contain');
    // La fenêtre réellement visible, barres du navigateur comprises.
    expect(dialog.style.height).toBe('100dvh');
  });

  it('suit la rotation : demande plus grand sans repartir de zéro', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();

    // Téléphone droit : les 1200 px de la fiche couvrent déjà les 780 px utiles.
    expect(galleryImages(dialog)[0]).toBe(variant(0, FICHE));
    [...dialog.querySelectorAll('img')].forEach((img) => fireEvent.load(img));

    // On tourne l'appareil : 844 px à densité 2, la photo mérite mieux.
    Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true });
    fireEvent(window, new Event('orientationchange'));

    // La photo NE DISPARAÎT PAS le temps du chargement : on garde la
    // déclinaison arrivée et la plus grande se prépare à côté.
    expect(galleryImages(dialog)[0]).toBe(variant(0, FICHE));
    expect(galleryImages(dialog)).toContain(variant(0, 1600));
    fireEvent.load(dialog.querySelectorAll('img')[1]!);
    expect(galleryImages(dialog)[0]).toBe(variant(0, 1600));

    // Le rang ne bouge pas : on regarde toujours la même photo.
    expect(within(dialog).getByText('Photo 1 sur 12')).toBeInTheDocument();

    // Et l'on repose l'appareil à plat : rien à recharger, surtout pas plus
    // petit que ce qui est à l'écran.
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    fireEvent(window, new Event('resize'));
    expect(galleryImages(dialog)).toEqual([variant(0, 1600), variant(1, 1600)]);
  });

  it('le dit quand une photo ne charge pas, et la galerie reste navigable', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={SERIES} tall expandable />);
    const dialog = openGallery();

    // La déclinaison échoue : on retente l'originale, comme le carrousel.
    fireEvent.error(dialog.querySelector('img')!);
    expect(galleryImages(dialog)[0]).toBe(SERIES[0]);

    fireEvent.error(dialog.querySelector('img')!);
    expect(within(dialog).getByRole('status')).toHaveTextContent('n’a pas pu être chargée');
    // Le rang ne bouge pas : retirer la photo décalerait toute la série.
    expect(within(dialog).getByText('Photo 1 sur 12')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('Photo 2 sur 12')).toBeInTheDocument();
    expect(galleryImages(dialog)[0]).toBe(variant(1, FICHE));
  });
});
