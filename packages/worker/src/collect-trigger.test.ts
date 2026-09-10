import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerCollect } from './collect-trigger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('réveil de la collecte', () => {
  it('ne prétend RIEN avoir déclenché sans jeton', async () => {
    // Le pire serait de laisser croire que la collecte repart : on attendrait
    // des annonces sans raison (§17).
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await triggerCollect({});
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('GITHUB_DISPATCH_TOKEN');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('demande le workflow de collecte sur `main`', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const result = await triggerCollect({ GITHUB_DISPATCH_TOKEN: 'jeton' });

    expect(result.triggered).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://api.github.com/repos/WizyxGH/Maioun/actions/workflows/collect.yml/dispatches',
    );
    // `ref` est obligatoire : sans lui GitHub refuse le déclenchement.
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ ref: 'main' });
  });

  it('accepte un autre dépôt', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await triggerCollect({ GITHUB_DISPATCH_TOKEN: 'jeton', GITHUB_REPOSITORY: 'moi/fork' });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/repos/moi/fork/');
  });

  it('dit ce que GitHub a refusé plutôt que de le taire', async () => {
    // 404 signifie ici « jeton sans la permission Actions », le cas le plus
    // probable — et celui qu'on chercherait longtemps sans le message.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const result = await triggerCollect({ GITHUB_DISPATCH_TOKEN: 'jeton' });
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('404');
  });

  it('NE LÈVE PAS quand l’appel échoue', async () => {
    // Le Worker sert aussi l'API : un réveil raté ne doit pas l'emporter.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau coupé'));
    const result = await triggerCollect({ GITHUB_DISPATCH_TOKEN: 'jeton' });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('réseau coupé');
  });
});
