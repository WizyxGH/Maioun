import { describe, expect, it } from 'vitest';
import { isFatalFetchError, stopReasonFromError } from './stop-reason.js';

describe('stopReasonFromError', () => {
  it('reconnaît le bridage au code 429, où qu’il soit dans le message', () => {
    expect(stopReasonFromError('HTTP 429 sur https://exemple.invalid/x')).toBe('rateLimited');
    expect(stopReasonFromError('429')).toBe('rateLimited');
  });

  it('reconnaît le refus au mot « refusé », accent compris', () => {
    expect(stopReasonFromError('Accès refusé (403)')).toBe('blocked');
  });

  it('range tout le reste en panne ordinaire, dont les autres codes', () => {
    expect(stopReasonFromError('HTTP 500')).toBe('tooManyErrors');
    expect(stopReasonFromError('ECONNRESET')).toBe('tooManyErrors');
    expect(stopReasonFromError('')).toBe('tooManyErrors');
  });

  it('le bridage prime sur le refus quand le message porte les deux', () => {
    expect(stopReasonFromError('429 : accès refusé le temps du quota')).toBe('rateLimited');
  });

  // Un 404 est une page absente, pas un domaine fermé : la boucle continue.
  it('isFatalFetchError ne retient que le bridage et le refus', () => {
    expect(isFatalFetchError('HTTP 429')).toBe(true);
    expect(isFatalFetchError('Accès refusé')).toBe(true);
    expect(isFatalFetchError('HTTP 404')).toBe(false);
    expect(isFatalFetchError('HTTP 500')).toBe(false);
  });
});
