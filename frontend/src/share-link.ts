/**
 * Partage d'un lien : la feuille native du téléphone quand le navigateur l'offre,
 * sinon le presse-papiers.
 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareTarget {
  readonly title: string;
  readonly url: string;
}

export async function shareLink(
  target: ShareTarget,
  nav: Pick<Navigator, 'share' | 'clipboard'> = navigator,
): Promise<ShareOutcome> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: target.title, url: target.url });
      return 'shared';
    } catch (error) {
      // Feuille refermée sans choisir : rien à signaler.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await nav.clipboard.writeText(target.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
