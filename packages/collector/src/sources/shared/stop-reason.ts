/**
 * Ce qu'une requête échouée dit de la source.
 *
 * POURQUOI ICI. La même cascade — « 429 ? débit bridé : refusé ? bloqué :
 * trop d'erreurs » — était recopiée dans une trentaine de scrapers, tantôt en
 * expression ternaire, tantôt en suite de `if`, et deux sources en avaient déjà
 * fait une fonction sous deux noms différents (`stopReasonOf` chez Foncia,
 * `raisonDArret` chez Orpi). Le jour où le client HTTP changera le libellé de
 * ses erreurs, c'est un seul endroit qu'il faudra relire.
 *
 * LE MESSAGE EST LE SEUL INDICE. Le scraper ne reçoit pas le statut HTTP : le
 * client lève une `Error` dont le texte porte le code. On ne teste donc pas un
 * type d'exception mais son message, et c'est la raison pour laquelle cette
 * fonction vit du côté des sources, avec le client qui rédige ces messages.
 *
 * UNE VARIANTE PLUS COURTE EXISTE ENCORE dans une dizaine de sources : elles
 * rendent `tooManyErrors` là où un refus donne ici `blocked`. Les deux mènent
 * au même traitement en aval — le pipeline les range dans la même branche, et
 * `withdrawnRefsFrom` refuse de conclure sur l'une comme sur l'autre —, mais la
 * distinction se perd dans le journal. Elles ne sont pas migrées ici : ce serait
 * changer ce qu'elles rapportent, ce qui ne relève pas d'une factorisation.
 */

import type { StopReason } from '@maioun/shared';

/**
 * La raison d'arrêt que porte le message d'une requête échouée.
 *
 * `429` : le site bride le débit, on repassera. « refusé » : il nous ferme la
 * porte, et on ne cherche pas à la forcer. Tout le reste est une panne
 * ordinaire, dont on ne conclut rien sur l'inventaire.
 */
export function stopReasonFromError(message: string): StopReason {
  if (message.includes('429')) return 'rateLimited';
  if (message.includes('refusé')) return 'blocked';
  return 'tooManyErrors';
}

/**
 * `true` si l'échec vaut l'abandon du passage plutôt qu'une page sautée.
 *
 * Les boucles de pagination posaient toutes la même double question avant de
 * sortir : « est-ce 429, ou un refus ? ». Une page en panne isolée, elle, ne
 * doit pas interrompre la lecture des suivantes.
 */
export function isFatalFetchError(message: string): boolean {
  return message.includes('429') || message.includes('refusé');
}
