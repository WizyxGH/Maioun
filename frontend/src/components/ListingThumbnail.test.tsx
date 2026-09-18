import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { ListingThumbnail } from './ListingThumbnail.js';

describe('ListingThumbnail', () => {
  it('demande une petite taille, retente l’originale, puis masque le cadre', () => {
    const photo = 'https://media.apimo.pro/cache/abc_def_1920-original.jpg';
    const { container } = render(<ListingThumbnail url={photo} className="size-14" />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'https://media.apimo.pro/cache/abc_def_200-original.jpg');

    fireEvent.error(img);
    expect(img).toHaveAttribute('src', photo);
    expect(img).not.toHaveClass('invisible');

    fireEvent.error(img);
    expect(img).toHaveClass('invisible');
  });

  it('masque directement une photo sans déclinaison qui échoue', () => {
    const { container } = render(<ListingThumbnail url="https://x/1.jpg" className="size-12" />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(img).toHaveClass('invisible');
  });
});

describe('photo servie en HTTP clair', () => {
  // La page d'essai est en http : on la déclare sécurisée, sinon le navigateur
  // n'a rien à bloquer et le relais ne sert pas.
  beforeEach(() => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      protocol: 'https:',
    } as Location);
  });
  afterEach(() => vi.restoreAllMocks());

  it('passe par le relais au lieu d’être bloquée par le navigateur', () => {
    // BEP sert ses photos en clair : sur un site en HTTPS, le navigateur les
    // refuse. L'historique des alertes affichait alors un cadre vide.
    const { container } = render(
      <ListingThumbnail
        url="http://www.beptransaction.com/bep/docs/photo.jpg"
        className="size-14"
      />,
    );
    const src = container.querySelector('img')?.getAttribute('src') ?? '';
    expect(src.startsWith('http://')).toBe(false);
  });
});
