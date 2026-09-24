/**
 * CE QU'UN BAILLEUR NE PEUT PAS EXIGER.
 *
 * Le décret n° 2015-1437 du 5 novembre 2015, pris pour la loi ALUR, fixe la
 * liste des pièces du dossier de location et elle est LIMITATIVE : aucune
 * autre ne peut légalement être réclamée. Le savoir évite d'en donner plus que
 * nécessaire, et c'est une information qui vaut par elle-même.
 *
 * Elle vivait sous l'écran de dépôt des pièces, qui a disparu au profit du
 * seul lien DossierFacile. Elle reste, parce que le service de l'État ne
 * dispense pas de savoir ce qu'on a le droit de refuser.
 */
export const FORBIDDEN_PIECES: readonly string[] = [
  'relevé de compte bancaire',
  'attestation d’absence de crédit',
  'autorisation de prélèvement automatique',
  'photographie d’identité',
  'carte Vitale',
  'dossier médical',
  'extrait de casier judiciaire',
  'attestation de l’ancien bailleur disant que le locataire est à jour',
  'chèque de réservation',
];
