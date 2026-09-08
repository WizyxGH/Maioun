/**
 * DEUX FICHIERS DU MÊME NOM S'ÉCRASAIENT EN SILENCE. Le stockage est un
 * ensemble de clés : le second occupait celle du premier. Or c'est le cas
 * courant — les photos d'un téléphone s'appellent toutes `IMG_1234.jpg`, et
 * l'on dépose justement un recto ET un verso. On croyait n'avoir réussi qu'un
 * seul envoi (signalé le 2026-09-08).
 */

import { describe, expect, it } from 'vitest';
import { uniqueName } from './DocumentsSection.js';

describe('uniqueName', () => {
  it('garde le nom quand rien ne le prend', () => {
    expect(uniqueName(null, 'bulletin.pdf', new Set())).toBe('bulletin.pdf');
  });

  it('préfixe selon l’emplacement', () => {
    expect(uniqueName('identite', 'recto.jpg', new Set())).toContain('recto.jpg');
    expect(uniqueName('identite', 'recto.jpg', new Set())).not.toBe('recto.jpg');
  });

  it('numérote un homonyme, avant l’extension', () => {
    const pris = new Set([uniqueName('identite', 'IMG_1234.jpg', new Set())]);
    const second = uniqueName('identite', 'IMG_1234.jpg', pris);
    expect(second).not.toBe([...pris][0]);
    expect(second).toMatch(/IMG_1234 \(2\)\.jpg$/);
  });

  it('continue à numéroter au-delà du deuxième', () => {
    const pris = new Set<string>();
    for (let i = 0; i < 3; i += 1) pris.add(uniqueName(null, 'photo.png', pris));
    expect([...pris]).toEqual(['photo.png', 'photo (2).png', 'photo (3).png']);
  });

  it('gère un fichier sans extension', () => {
    const pris = new Set(['note']);
    expect(uniqueName(null, 'note', pris)).toBe('note (2)');
  });
});
