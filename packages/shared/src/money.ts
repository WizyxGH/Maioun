/**
 * ÉCRIRE UN LOYER SANS LE DÉFORMER.
 *
 * Il était arrondi à l'euro pour l'affichage : une annonce publiée à 630,50 €
 * s'affichait « 631 € ». Signalé par l'utilisateur, la page de l'agence sous
 * les yeux. Ce n'est pas un détail de présentation — c'est le montant du bail,
 * et le nôtre ne correspondait plus à celui qu'il lisait chez l'agence.
 * Soixante-sept annonces actives portent des centimes.
 *
 * UNE SEULE FABRIQUE, parce que trois écrans l'écrivaient chacun à sa façon :
 * la liste arrondissait, l'e-mail d'alerte arrondissait aussi, et le texte
 * brut rendait « 630.5 € » — un point décimal, qui ne s'écrit pas en français.
 */

/**
 * Le loyer, tel qu'il s'écrit : « 690 € », « 630,50 € ».
 *
 * Les centimes ne paraissent que s'il y en a : « 690,00 € » sur un loyer rond
 * ferait croire à une précision comptable que l'annonce ne donne pas.
 */
export function formatRent(price: number): string {
  // Deux décimales au plus : un flottant peut traîner « 630.5000000000001 ».
  const rounded = Math.round(price * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} €` : `${rounded.toFixed(2).replace('.', ',')} €`;
}
