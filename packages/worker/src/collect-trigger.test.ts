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

    const result = await triggerCollect({
      GITHUB_DISPATCH_TOKEN: 'jeton',
      GITHUB_REPOSITORY_ID: '1353824560',
    });

    expect(result.triggered).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    // PAR L'IDENTIFIANT : il survit au renommage et au transfert du dépôt.
    expect(String(url)).toBe(
      'https://api.github.com/repositories/1353824560/actions/workflows/collect.yml/dispatches',
    );
    // `ref` est obligatoire : sans lui GitHub refuse le déclenchement.
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ ref: 'main' });
  });

  it('n’appuie sur le bouton d’AUCUN dépôt qu’on ne lui a pas désigné', async () => {
    // Il y avait un dépôt par défaut, écrit en dur : sans configuration, le
    // réveil visait un nom que le premier renommage rendait faux.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await triggerCollect({ GITHUB_DISPATCH_TOKEN: 'jeton' });
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('GITHUB_REPOSITORY_ID');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('préfère l’identifiant au nom quand les deux sont donnés', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    await triggerCollect({
      GITHUB_DISPATCH_TOKEN: 'jeton',
      GITHUB_REPOSITORY_ID: '42',
      GITHUB_REPOSITORY: 'moi/ancien-nom',
    });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/repositories/42/');
  });

  it('accepte un dépôt par son nom, à défaut d’identifiant', async () => {
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
    const result = await triggerCollect({
      GITHUB_DISPATCH_TOKEN: 'jeton',
      GITHUB_REPOSITORY_ID: '1',
    });
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('404');
  });

  it('NE LÈVE PAS quand l’appel échoue', async () => {
    // Le Worker sert aussi l'API : un réveil raté ne doit pas l'emporter.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau coupé'));
    const result = await triggerCollect({
      GITHUB_DISPATCH_TOKEN: 'jeton',
      GITHUB_REPOSITORY_ID: '1',
    });
    expect(result.triggered).toBe(false);
    expect(result.reason).toBe('réseau coupé');
  });
});
