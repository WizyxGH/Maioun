import { describe, expect, it } from 'vitest';
import { mapLimited, memoizeStore, runGrouped } from './concurrency.js';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapLimited', () => {
  it('garde l’ordre et ne dépasse jamais la limite', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimited([30, 10, 20, 5, 15], 2, async (ms, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await pause(ms);
      running -= 1;
      return index;
    });
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('rend un tableau vide sans rien lancer', async () => {
    expect(await mapLimited([], 4, () => Promise.reject(new Error('jamais')))).toEqual([]);
  });
});

describe('runGrouped', () => {
  it('enchaîne un même site, parallélise les autres', async () => {
    const journal: string[] = [];
    const tasks = [
      { site: 'a', id: 'a1' },
      { site: 'a', id: 'a2' },
      { site: 'b', id: 'b1' },
    ];
    let runningOnA = 0;
    let peakOnA = 0;
    await runGrouped(
      tasks,
      (task) => task.site,
      4,
      async (task) => {
        if (task.site === 'a') runningOnA += 1;
        peakOnA = Math.max(peakOnA, runningOnA);
        journal.push(`début ${task.id}`);
        await pause(10);
        if (task.site === 'a') runningOnA -= 1;
      },
    );
    expect(peakOnA).toBe(1);
    // b1 démarre sans attendre la file de a.
    expect(journal.indexOf('début b1')).toBeLessThan(journal.indexOf('début a2'));
  });
});

describe('memoizeStore', () => {
  it('ne lit chaque clé qu’une fois, et voit ce qu’on vient d’écrire', async () => {
    let reads = 0;
    const backing = new Map<string, number>([['x', 1]]);
    const store = memoizeStore<number>({
      get: (key) => {
        reads += 1;
        return Promise.resolve(backing.get(key) ?? null);
      },
      set: (key, value) => {
        backing.set(key, value);
        return Promise.resolve();
      },
    });
    expect(await store.get('x')).toBe(1);
    expect(await store.get('x')).toBe(1);
    expect(reads).toBe(1);
    await store.set('y', 2);
    expect(await store.get('y')).toBe(2);
    expect(reads).toBe(1);
  });
});
