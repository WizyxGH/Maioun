import { describe, expect, it } from 'vitest';
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
