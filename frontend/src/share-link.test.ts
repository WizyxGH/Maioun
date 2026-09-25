// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

import { describe, expect, it, vi } from 'vitest';
import { shareLink } from './share-link.js';

const target = { title: 'Studio', url: 'https://exemple.invalid/app/listing/orpi%3A1' };

function nav(share?: Navigator['share'], writeText = vi.fn().mockResolvedValue(undefined)) {
  return {
    ...(share === undefined ? {} : { share }),
    clipboard: { writeText } as unknown as Clipboard,
  } as Pick<Navigator, 'share' | 'clipboard'>;
}

describe('partage d’un lien', () => {
  it('ouvre la feuille native quand elle existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(target, nav(share))).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Studio', url: target.url });
  });

  it('ne copie rien quand on referme la feuille', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new DOMException('annulé', 'AbortError'));
    expect(await shareLink(target, nav(share, writeText))).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copie le lien sans feuille native', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(target, nav(undefined, writeText))).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(target.url);
  });
});
