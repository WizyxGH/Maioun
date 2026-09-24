/**
 * QUI PEUT LIRE LE SERVEUR LOCAL, depuis un navigateur.
 *
 * Écouter la boucle locale ne protège de rien à soi seul : n'importe quelle
 * page ouverte dans le navigateur peut joindre `127.0.0.1`. Seule la règle
 * d'origine l'en empêche, et elle doit tenir dans les deux sens — laisser
 * entrer le site de développement, refuser tout le reste.
 */

import { describe, expect, it } from 'vitest';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  SESSION_KEY_HEADER,
  SESSION_PROOF_HEADER,
  SESSION_TIME_HEADER,
  SESSION_TOKEN_HEADER,
  SECOURS_HEADER,
} from '@maioun/shared';
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

/**
 * CE QUE LE NAVIGATEUR A LE DROIT D'ENVOYER.
 *
 * Ces listes étaient écrites à la main ici, plus courtes que celles du Worker :
 * `content-type` seul, et pas de PUT. La page joint pourtant à chaque appel sa
 * clé d'appareil et sa preuve — le pré-vol échouait donc, le navigateur
 * refusait la requête AVANT de l'envoyer, et le site branché sur l'API locale
 * n'affichait rien. Sans message : le serveur ne voyait rien passer.
 */
describe('en-têtes autorisés', () => {
  it('laisse passer ce que la page envoie vraiment', () => {
    const permis = entetes('http://localhost:5173')['Access-Control-Allow-Headers'] ?? '';
    for (const nom of [
      'Content-Type',
      'Authorization',
      SESSION_KEY_HEADER,
      SESSION_PROOF_HEADER,
      SESSION_TIME_HEADER,
    ]) {
      expect(permis).toContain(nom);
    }
  });

  it('laisse la page LIRE le jeton renouvelé et la marque de secours', () => {
    // Sans le jeton, la session expire au lieu de se prolonger, et l'on est
    // déconnecté sans raison apparente. Sans la marque, l'écran ne peut pas
    // dire qu'il montre une copie.
    const expose = entetes('http://localhost:5173')['Access-Control-Expose-Headers'] ?? '';
    expect(expose).toContain(SESSION_TOKEN_HEADER);
    expect(expose).toContain(SECOURS_HEADER);
  });

  it('autorise PUT, par quoi passent les critères et les réglages', () => {
    expect(entetes('http://localhost:5173')['Access-Control-Allow-Methods']).toContain('PUT');
  });

  // LA MÊME LISTE QUE LE WORKER, et c'est tout l'objet du partage : une
  // constante recopiée redeviendrait fausse au premier en-tête ajouté.
  it('prend les listes partagées, sans les recopier', () => {
    const rendus = entetes('http://localhost:5173');
    expect(rendus['Access-Control-Allow-Headers']).toBe(CORS_ALLOWED_HEADERS);
    expect(rendus['Access-Control-Allow-Methods']).toBe(CORS_ALLOWED_METHODS);
  });

  // Une origine refusée ne reçoit PAS d'autorisation d'origine — mais les
  // listes communes, elles, n'ont rien de secret.
  it('ne donne pas l’origine à un site tiers', () => {
    expect(entetes('https://exemple.test')['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
