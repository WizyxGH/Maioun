/**
 * Les liens qui viennent des sites collectés, ramenés à ce qu'un lien doit être.
 *
 * L'adresse d'une annonce et celle d'un formulaire d'agence sont recopiées
 * telles quelles depuis la page d'un tiers : ce sont 213 sites que nous ne
 * tenons pas. Posée directement dans un `href`, une adresse en `javascript:`
 * s'exécute au clic, dans notre origine — donc avec le profil locataire et le
 * jeton de session à portée.
 *
 * On n'accepte donc que `http:` et `https:`, et on rend `null` pour tout le
 * reste : l'appelant n'affiche alors pas de lien du tout, ce qui vaut mieux
 * qu'un lien qui ment sur ce qu'il fait.
 *
 * `javascript:` n'est pas le seul schéma à écarter — `data:` porte une page
 * entière, `vbscript:` existe encore sur d'anciens moteurs — d'où une liste
 * de ce qu'on ACCEPTE plutôt qu'une liste de ce qu'on refuse.
 */
export function safeHref(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  try {
    // `new URL` règle seul les pièges d'écriture : espaces en tête, retours à
    // la ligne au milieu du schéma, majuscules. Une comparaison de chaîne les
    // laisserait tous passer.
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    // Adresse relative ou illisible : pas un lien sortant, on n'en fait pas un.
    return null;
  }
}
