/**
 * « CE QUE VOUS VOYEZ EST UNE COPIE », et de quand elle date.
 *
 * Quand le quota de lectures de la base principale est épuisé, le Worker se
 * replie sur une copie et marque ses réponses. Sans cet écran, la copie
 * passerait pour l'état du jour : on chercherait à appeler une agence pour une
 * annonce louée depuis trois jours, sans que rien n'ait prévenu.
 *
 * Un état à part plutôt qu'un champ de plus dans chaque réponse : l'information
 * ne vient pas du corps mais de l'EN-TÊTE, elle vaut pour l'application entière
 * et pas pour un écran, et chaque requête la met à jour.
 */

/** La valeur reçue : une date ISO, `copie` sans date, ou `null` hors secours. */
let etat: string | null = null;
const abonnes = new Set<() => void>();

/**
 * Ce que la dernière réponse a dit.
 *
 * LA DERNIÈRE L'EMPORTE, et c'est voulu : le retour de la base principale doit
 * faire disparaître le bandeau sans recharger la page.
 */
export function noterSecours(entete: string | null): void {
  const valeur = entete === null || entete === '' ? null : entete;
  if (valeur === etat) return;
  etat = valeur;
  for (const prevenir of abonnes) prevenir();
}

/** `null` si tout va bien, sinon la marque de la copie. */
export function secoursActuel(): string | null {
  return etat;
}

/** Pour `useSyncExternalStore`. */
export function surChangementDeSecours(prevenir: () => void): () => void {
  abonnes.add(prevenir);
  return () => {
    abonnes.delete(prevenir);
  };
}

/**
 * Ce qu'on écrit à l'écran.
 *
 * La date est celle de la DERNIÈRE COLLECTE contenue dans la copie, pas celle
 * de la copie elle-même : c'est l'âge des annonces qui compte, pas la date du
 * fichier.
 */
export function messageDeSecours(marque: string): string {
  const quand = new Date(marque);
  if (marque === 'copie' || Number.isNaN(quand.getTime())) {
    return 'Vous consultez une copie de secours : la base principale est momentanément fermée. Rien ne peut être enregistré.';
  }
  const date = quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const heure = quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `Vous consultez une copie de secours, arrêtée au ${date} à ${heure} : la base principale est momentanément fermée. Rien ne peut être enregistré.`;
}
