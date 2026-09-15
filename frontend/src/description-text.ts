/**
 * Mise en forme d'affichage d'une description venue d'un seul bloc.
 *
 * Certaines sources ne publient aucun retour à la ligne. On n'invente alors que
 * des ruptures sans ambiguïté : avant une puce répétée, et avant une rubrique
 * chiffrée (« Loyer », « DPE »…) qui ouvre une nouvelle phrase. Un texte qui
 * porte déjà ses lignes est rendu tel quel.
 */

/** Puces : une seule ne fait pas une liste. */
const BULLET = /\s*([•●▪►➤✓✔✅])\s*/gu;

/** Rubriques qui ouvrent un paragraphe, seulement après une fin de phrase. */
const SECTION =
  /([.!?])\s+(?=(?:Loyer|Charges|Provisions? sur charges|Dépôt de garantie|Honoraires|DPE|GES|Disponible|Libre|Les informations sur les risques|Montant estimé)(?!\p{L}))/gu;

export function readableDescription(text: string): string {
  if (text.includes('\n')) return text;
  const bullets = text.match(BULLET)?.length ?? 0;
  let out = text;
  if (bullets >= 2) out = out.replace(BULLET, '\n$1 ');
  out = out.replace(SECTION, '$1\n\n');
  return out.trim();
}
