/**
 * Boîte de réception : déduire le statut d'une annonce des messages reçus.
 *
 * `inbox/` et non `notify/` : `notify/` est ce que Maïoun ENVOIE (alertes,
 * push, brouillons). Ici, le sens est inverse — on lit ce qui arrive. Ranger
 * les deux ensemble ferait perdre de vue la règle qui ne vaut que d'un côté :
 * un message entrant n'est lu que s'il vient d'un expéditeur suivi.
 */

export {
  adresseNormalisee,
  domaineDe,
  estMessagerieGrandPublic,
  expediteursSuivis,
  fragmentsDeRecherche,
  vientDUnPortail,
} from './senders.js';
export type {
  AgenceContactee,
  ExpediteurSuivi,
  ExpediteursOptions,
  OrigineExpediteur,
} from './senders.js';

export { lireReponse } from './reply-reader.js';
export type {
  AnnonceCandidate,
  ForceAppariement,
  LectureOptions,
  LectureReponse,
  MessageRecu,
  PropositionStatut,
  RaisonSilence,
} from './reply-reader.js';
