import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoCarousel } from './PhotoCarousel.js';

const URLS = ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'];

describe('PhotoCarousel', () => {
  it('affiche des flèches et des points quand il y a plusieurs photos', () => {
    render(<PhotoCarousel urls={URLS} />);
    expect(screen.getByLabelText('Photo précédente')).toBeInTheDocument();
    expect(screen.getByLabelText('Photo suivante')).toBeInTheDocument();
    expect(screen.getByLabelText('Aller à la photo 1')).toHaveAttribute('aria-current', 'true');
  });

  it('n’affiche ni flèche ni point pour une seule photo', () => {
    render(<PhotoCarousel urls={['https://x/only.jpg']} />);
    expect(screen.queryByLabelText('Photo suivante')).not.toBeInTheDocument();
  });

  it('avance et S’ARRÊTE à la dernière photo', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={URLS} />);
    const next = screen.getByLabelText('Photo suivante');

    await user.click(next);
    expect(screen.getByLabelText('Aller à la photo 2')).toHaveAttribute('aria-current', 'true');

    // 2 → 3, puis plus rien : la série bouclait, et on croyait avoir raté un
    // geste ou revu deux fois la même image.
    await user.click(next);
    expect(screen.getByLabelText('Aller à la photo 3')).toHaveAttribute('aria-current', 'true');
    expect(next).toBeDisabled();
  });

  it('éteint la flèche « précédente » sur la première photo', () => {
    render(<PhotoCarousel urls={URLS} />);
    expect(screen.getByLabelText('Photo précédente')).toBeDisabled();
    expect(screen.getByLabelText('Photo suivante')).toBeEnabled();
  });

  it('saute directement à une photo via son point', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={URLS} />);
    await user.click(screen.getByLabelText('Aller à la photo 3'));
    expect(screen.getByLabelText('Aller à la photo 3')).toHaveAttribute('aria-current', 'true');
  });
});

describe('PhotoCarousel — chargement', () => {
  const SERIES = Array.from({ length: 6 }, (_, at) => `https://x/${at + 1}.jpg`);
  const sources = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('ne monte que la photo visible et sa voisine', () => {
    const { container } = render(<PhotoCarousel urls={SERIES} />);
    expect(sources(container)).toEqual(['https://x/1.jpg', 'https://x/2.jpg']);
    // Les emplacements restent : la piste garde sa longueur et ses points.
    expect((container.firstElementChild!.firstElementChild as HTMLElement).children).toHaveLength(
      6,
    );
  });

  it('suit la navigation et garde les photos déjà montées', async () => {
    const user = userEvent.setup();
    const { container } = render(<PhotoCarousel urls={SERIES} />);
    await user.click(screen.getByLabelText('Aller à la photo 5'));
    expect(sources(container)).toEqual([
      'https://x/1.jpg',
      'https://x/2.jpg',
      'https://x/4.jpg',
      'https://x/5.jpg',
      'https://x/6.jpg',
    ]);
  });

  it('ne précharge aucune voisine sur une connexion lente', async () => {
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '3g' },
      configurable: true,
    });
    const user = userEvent.setup();
    const { container } = render(<PhotoCarousel urls={SERIES} />);
    expect(sources(container)).toEqual(['https://x/1.jpg']);
    await user.click(screen.getByLabelText('Photo suivante'));
    expect(sources(container)).toEqual(['https://x/1.jpg', 'https://x/2.jpg']);
  });

  it('demande une taille réduite, plus petite encore sur réseau lent', () => {
    const photo = 'https://agence.staticlbi.com/1600xauto/images/biens/1/a/p.jpg';
    const { container, unmount } = render(<PhotoCarousel urls={[photo]} />);
    expect(sources(container)).toEqual([
      'https://agence.staticlbi.com/800xauto/images/biens/1/a/p.jpg',
    ]);
    unmount();
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });
    const slow = render(<PhotoCarousel urls={[photo]} tall />);
    expect(sources(slow.container)).toEqual([
      'https://agence.staticlbi.com/800xauto/images/biens/1/a/p.jpg',
    ]);
  });

  it('retente l’originale quand la déclinaison échoue, puis retire la photo', () => {
    const photo = 'https://agence.staticlbi.com/1600xauto/images/biens/1/a/p.jpg';
    const { container } = render(<PhotoCarousel urls={[photo, 'https://x/2.jpg']} />);
    fireEvent.error(container.querySelector('img')!);
    expect(sources(container)[0]).toBe(photo);
    fireEvent.error(container.querySelector('img')!);
    expect(sources(container)).toEqual(['https://x/2.jpg']);
  });

  it('retire aussitôt une photo sans déclinaison qui échoue', () => {
    const { container } = render(<PhotoCarousel urls={SERIES} />);
    fireEvent.error(container.querySelector('img')!);
    // La suivante prend la place, et sa voisine est montée à son tour.
    expect(sources(container)).toEqual(['https://x/2.jpg', 'https://x/3.jpg']);
  });
});

describe('PhotoCarousel — glissement du doigt', () => {
  const PHOTOS = ['https://exemple.invalid/1.jpg', 'https://exemple.invalid/2.jpg'];

  /** Simule un glissement horizontal de `delta` pixels sur la piste. */
  function swipe(element: HTMLElement, delta: number): void {
    fireEvent.touchStart(element, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(element, { changedTouches: [{ clientX: 200 + delta }] });
  }

  it('avance d’une photo vers la gauche, recule vers la droite', () => {
    const { container } = render(<PhotoCarousel urls={PHOTOS} />);
    const root = container.firstElementChild as HTMLElement;
    const track = (): HTMLElement => root.firstElementChild as HTMLElement;

    expect(track().style.transform).toBe('translateX(-0%)');
    swipe(root, -120);
    expect(track().style.transform).toBe('translateX(-100%)');
    swipe(root, 120);
    expect(track().style.transform).toBe('translateX(-0%)');
  });

  it('ignore une hésitation du doigt', () => {
    // Sous le seuil, on fait défiler la page — pas le carrousel.
    const { container } = render(<PhotoCarousel urls={PHOTOS} />);
    const root = container.firstElementChild as HTMLElement;
    swipe(root, -10);
    expect((root.firstElementChild as HTMLElement).style.transform).toBe('translateX(-0%)');
  });

  it('ne dépasse aucun des deux bouts de la série', () => {
    const { container } = render(<PhotoCarousel urls={PHOTOS} />);
    const root = container.firstElementChild as HTMLElement;
    const track = (): HTMLElement => root.firstElementChild as HTMLElement;

    // Sur la PREMIÈRE, glisser vers la droite ne ramène pas à la dernière.
    swipe(root, 120);
    expect(track().style.transform).toBe('translateX(-0%)');

    // Sur la DERNIÈRE, glisser vers la gauche ne revient pas à la première.
    swipe(root, -120);
    expect(track().style.transform).toBe('translateX(-100%)');
    swipe(root, -120);
    expect(track().style.transform).toBe('translateX(-100%)');
  });

  it('ne fait rien avec une seule photo', () => {
    const { container } = render(<PhotoCarousel urls={[PHOTOS[0]!]} />);
    const root = container.firstElementChild as HTMLElement;
    swipe(root, -120);
    expect((root.firstElementChild as HTMLElement).style.transform).toBe('translateX(-0%)');
  });
});

/**
 * LA VISITE EN VIDÉO, première diapositive de la série.
 *
 * Elle ouvre un DÉCALAGE d'un rang entre ce qu'on fait défiler et les photos
 * que connaît la galerie plein écran : c'est là que ça casse en silence, en
 * agrandissant une autre photo que celle qu'on a touchée.
 */
describe('visite en vidéo', () => {
  const VIDEO = 'https://player.previsite.net/video/00000000-0000-4000-8000-000000000001';

  it('met la vidéo en tête, sans charger le lecteur', () => {
    render(<PhotoCarousel urls={URLS} videoUrl={VIDEO} />);
    expect(screen.getByLabelText('Aller à la vidéo')).toHaveAttribute('aria-current', 'true');
    // Le lecteur d'un tiers ne se monte pas à l'ouverture d'une fiche : la
    // source saurait qui a ouvert quoi, pour une vidéo que peu regarderont.
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByLabelText('Lire la visite en vidéo')).toBeInTheDocument();
  });

  it('monte le lecteur au clic, chez la source', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={URLS} videoUrl={VIDEO} />);
    await user.click(screen.getByLabelText('Lire la visite en vidéo'));
    const lecteur = document.querySelector('iframe');
    expect(lecteur).not.toBeNull();
    expect(lecteur).toHaveAttribute('src', VIDEO);
  });

  it('garde les trois photos derrière elle', () => {
    render(<PhotoCarousel urls={URLS} videoUrl={VIDEO} />);
    expect(screen.getByLabelText('Aller à la photo 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Aller à la photo 3')).toBeInTheDocument();
  });

  // LE DÉCALAGE : la deuxième diapositive est la PREMIÈRE photo.
  it('agrandit la photo touchée, et non sa voisine', async () => {
    const user = userEvent.setup();
    render(<PhotoCarousel urls={URLS} videoUrl={VIDEO} tall expandable />);
    expect(screen.getByLabelText('Agrandir la photo 1 sur 3')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Agrandir la photo 1 sur 3'));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('ne montre rien de tel sans vidéo', () => {
    render(<PhotoCarousel urls={URLS} />);
    expect(screen.queryByLabelText('Lire la visite en vidéo')).not.toBeInTheDocument();
  });
});
