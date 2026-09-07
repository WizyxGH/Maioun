/**
 * La liste blanche du relais de photos.
 *
 * Ces tests portent la SÉCURITÉ de la route : un relais qui va chercher l'URL
 * qu'on lui donne est une faille (SSRF) — on s'en sert pour joindre des
 * services internes, pour scanner, ou pour faire porter à notre infrastructure
 * le trafic d'un autre. La route étant publique, il n'y a rien derrière elle.
 */

import { describe, expect, it } from 'vitest';
import { relayable } from './photo-relay.js';

describe('ce que le relais accepte de joindre', () => {
  it('accepte l’hôte des photos du bulletin, en clair', () => {
    // Le cas pour lequel il existe : cet hôte NE FAIT PAS de TLS.
    expect(relayable('http://www.beptransaction.com/bep/docs/1-salon.jpg')).toBe(true);
    expect(relayable('http://beptransaction.com/bep/docs/1.jpg')).toBe(true);
    // Et en HTTPS si l'hôte y venait un jour.
    expect(relayable('https://www.beptransaction.com/bep/docs/1.jpg')).toBe(true);
  });

  it('REFUSE tout autre hôte', () => {
    expect(relayable('http://exemple.invalid/photo.jpg')).toBe(false);
    expect(relayable('https://www.google.com/logo.png')).toBe(false);
  });

  it('REFUSE ce qui vise le réseau interne', () => {
    // Le cœur du SSRF : joindre ce que seul le serveur peut voir.
    expect(relayable('http://127.0.0.1/admin')).toBe(false);
    expect(relayable('http://localhost:8080/')).toBe(false);
    expect(relayable('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(relayable('http://192.168.1.1/')).toBe(false);
  });

  it('REFUSE les protocoles qui ne sont pas du Web', () => {
    expect(relayable('file:///etc/passwd')).toBe(false);
    expect(relayable('data:image/png;base64,AAAA')).toBe(false);
    expect(relayable('ftp://beptransaction.com/1.jpg')).toBe(false);
  });

  it('ne se laisse pas tromper par une URL déguisée', () => {
    // L'identifiant avant `@` désigne un utilisateur, pas un hôte : l'hôte réel
    // est ce qui suit. C'est le déguisement le plus classique.
    expect(relayable('http://www.beptransaction.com@exemple.invalid/x.jpg')).toBe(false);
    // Un sous-domaine n'est pas l'hôte autorisé.
    expect(relayable('http://beptransaction.com.exemple.invalid/x.jpg')).toBe(false);
    // Un préfixe non plus.
    expect(relayable('http://notbeptransaction.com/x.jpg')).toBe(false);
  });

  it('rejette ce qui n’est pas une URL', () => {
    expect(relayable('')).toBe(false);
    expect(relayable('/bep/docs/1.jpg')).toBe(false);
    expect(relayable('pas une url')).toBe(false);
  });
});
