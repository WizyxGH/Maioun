/**
 * Durée écoulée lisible : « il y a 5 min », « il y a 3 h », « il y a 2 jours »,
 * « il y a 3 semaines », « il y a 4 mois ».
 *
 * Partagée entre le collecteur (motifs du score) et l'interface : sans elle,
 * une annonce découverte il y a onze jours s'affichait « il y a 15742 min ».
 */
export function formatElapsed(minutes: number): string {
  // Arrondi vers le bas : surestimer l'âge fait renoncer à tort à une annonce.
  const whole = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  if (whole < 1) return 'à l’instant';
  if (whole < 60) return `il y a ${whole} min`;

  // Les heures vont jusqu'à deux jours : « il y a 30 h » reste actionnable.
  const hours = Math.floor(whole / 60);
  if (hours < 48) return `il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `il y a ${days} jours`;

  const weeks = Math.floor(days / 7);
  if (days < 60) return `il y a ${weeks} semaines`;

  return `il y a ${Math.floor(days / 30)} mois`;
}
