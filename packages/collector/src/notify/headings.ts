/**
 * LE TITRE D'UNE ALERTE, ACCORDÉ AU NOMBRE D'ANNONCES QU'ELLE PORTE.
 *
 * Les titres étaient écrits en dur, chacun figé dans un nombre : l'e-mail
 * annonçait « Nouvelles annonces » pour un seul logement, et la notification
 * « Candidatures rouvertes » alors qu'elle n'en porte jamais qu'une — le push
 * part par annonce, l'e-mail groupe le passage entier.
 *
 * Ils vivent ici, et non dans chacun des deux canaux, pour que la notification
 * et l'e-mail ne puissent plus se contredire sur le nom d'une même famille.
 */

/** Les familles d'alerte, telles que la collecte les envoie. */
export type AlertFamily =
  'new' | 'reopened' | 'reappeared' | 'nearMatch' | 'favoriteGone' | 'reminder';

/** Singulier, puis pluriel. Un seul membre : le titre ne s'accorde pas. */
const TITRES: Readonly<Record<AlertFamily, readonly [string] | readonly [string, string]>> = {
  new: ['Nouvelle annonce', 'Nouvelles annonces'],
  reopened: ['Candidature rouverte', 'Candidatures rouvertes'],
  // Le logement qu'on croyait perdu : une visite annulée, un dossier qui
  // tombe. Le titre dit le RETOUR, pas la nouveauté — l'annonce, elle, n'est
  // pas neuve, et la présenter ainsi ferait douter du reste.
  reappeared: ['De retour en ligne', 'De retour en ligne'],
  nearMatch: ['Proche de vos critères', 'Proches de vos critères'],
  favoriteGone: ['💔 Un favori n’est plus disponible', '💔 Des favoris ne sont plus disponibles'],
  // Une phrase adressée au lecteur : elle ne compte pas les annonces.
  reminder: ['Vous n’avez pas encore candidaté'],
};

/**
 * @param count Combien d'annonces le message porte. Zéro et un prennent le
 *   singulier : le français ne met au pluriel qu'à partir de deux.
 */
export function alertHeading(family: AlertFamily, count: number): string {
  const [singulier, pluriel] = TITRES[family];
  return count > 1 && pluriel !== undefined ? pluriel : singulier;
}
