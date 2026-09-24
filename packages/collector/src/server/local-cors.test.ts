/**
 * QUI PEUT LIRE LE SERVEUR LOCAL, depuis un navigateur.
 *
 * Écouter la boucle locale ne protège de rien à soi seul : n'importe quelle
 * page ouverte dans le navigateur peut joindre `127.0.0.1`. Seule la règle
 * d'origine l'en empêche, et elle doit tenir dans les deux sens — laisser
 * entrer le site de développement, refuser tout le reste.
 */

import { describe, expect, it } from 'vitest';
import { entetes } from '../server/local-cors.js';

describe('entetes (CORS du serveur local)', () => {
  it('sert le site de développement, identifiants compris', () => {
    const rendus = entetes('http://localhost:5173');
    expect(rendus['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    // SANS CELUI-CI, RIEN NE MARCHE : le site appelle avec
    // `credentials: 'include'`, et le navigateur refuse alors la réponse.
    expect(rendus['Access-Control-Allow-Credentials']).toBe('true');
    // L'origine varie d'une requête à l'autre : un cache rendrait sinon à
    // l'une la réponse taillée pour l'autre.
    expect(rendus['Vary']).toBe('Origin');
  });

  it('accepte aussi 127.0.0.1, et n’importe quel port', () => {
    expect(entetes('http://127.0.0.1:4173')['Access-Control-Allow-Origin']).toBe(
      'http://127.0.0.1:4173',
    );
    expect(entetes('http://localhost')['Access-Control-Allow-Origin']).toBe('http://localhost');
  });

  /**
   * LE CAS QUI COMPTE. Une page malveillante ouverte ailleurs dans le
   * navigateur lirait les annonces si on lui renvoyait son origine.
   */
  it('ne donne aucune autorisation à une origine étrangère', () => {
    for (const origine of [
      'https://malveillant.invalid',
      'http://localhost.malveillant.invalid',
      'https://localhost',
      'http://127.0.0.1.malveillant.invalid',
      'null',
    ]) {
      expect(entetes(origine)['Access-Control-Allow-Origin']).toBeUndefined();
      expect(entetes(origine)['Access-Control-Allow-Credentials']).toBeUndefined();
    }
  });

  it('ne donne rien non plus sans origine du tout', () => {
    expect(entetes(undefined)['Access-Control-Allow-Origin']).toBeUndefined();
  });

  /**
   * LE MODE RÉSEAU, pour consulter depuis un téléphone — et lui seul.
   *
   * Il ne s'allume que si l'on a délibérément ouvert l'écoute : les deux
   * moitiés se décident ensemble, faute de quoi la règle s'élargirait sur un
   * serveur resté fermé, ou l'inverse.
   */
  describe('quand le serveur est ouvert au réseau', () => {
    it('sert une adresse privée du logement', () => {
      for (const origine of [
        'http://192.168.1.24:5173',
        'http://10.0.0.7:5173',
        'http://172.16.3.9:5173',
        'http://172.31.255.254',
      ]) {
        expect(entetes(origine, true)['Access-Control-Allow-Origin']).toBe(origine);
      }
    });

    // Une adresse PUBLIQUE n'a aucune raison de figurer ici : l'accepter
    // rouvrirait la porte que la règle précédente ferme.
    it('refuse toujours une adresse publique, et les plages voisines', () => {
      for (const origine of [
        'http://93.184.216.34:5173',
        'http://172.15.0.1:5173',
        'http://172.32.0.1:5173',
        'http://192.169.1.1:5173',
        'https://malveillant.invalid',
      ]) {
        expect(entetes(origine, true)['Access-Control-Allow-Origin']).toBeUndefined();
      }
    });

    it('n’élargit rien tant que l’écoute est restée locale', () => {
      expect(entetes('http://192.168.1.24:5173')['Access-Control-Allow-Origin']).toBeUndefined();
    });
  });
});
