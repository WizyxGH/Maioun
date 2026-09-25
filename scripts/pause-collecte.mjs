/**
 * LA COLLECTE EST-ELLE EN PAUSE, ET JUSQU'À QUAND ?
 *
 * Le quota mensuel de lectures Turso épuisé, la collecte échoue avant sa
 * première requête et n'a plus aucune chance d'aboutir avant la remise à zéro
 * du cycle. Elle a pourtant continué d'être réveillée toutes les vingt minutes
 * le 2026-09-24 : soixante échecs rouges en une nuit, tous identiques, tous
 * inévitables. Une intégration continue rouge en permanence ne prévient plus
 * de rien.
 *
 * D'OÙ CETTE PAUSE, posée dans la variable de dépôt
 * `COLLECTE_EN_PAUSE_JUSQU_AU` : une date, et la collecte est sautée jusque-là.
 *
 * LA REPRISE EST AUTOMATIQUE, et c'est tout l'intérêt : la date arrivée, la
 * comparaison cesse d'être vraie et la collecte repart sans que personne n'ait
 * à s'en souvenir. Rien à réactiver, donc rien à oublier de réactiver.
 *
 * ET ELLE SE TROMPE DU BON CÔTÉ : valeur absente, illisible, ou si lointaine
 * qu'elle sent la faute de frappe — on collecte. Une pause mal posée ne doit
 * pas éteindre le site en silence ; au pire elle échoue bruyamment, comme
 * avant.
 */

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Une date `AAAA-MM-JJ`, la seule forme qui se compare comme du texte. */
const FORMAT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Au-delà, c'est une faute de frappe. Une pause va d'un épuisement de quota à
 * la remise à zéro du mois suivant : 31 jours au plus. `2027-10-01` pour
 * `2026-10-01` éteindrait la collecte un an, sans que rien ne le dise.
 */
const PAUSE_MAXIMALE_EN_JOURS = 40;

/**
 * Faut-il collecter aujourd'hui ?
 *
 * @param {string | undefined} jusquAu Valeur de `COLLECTE_EN_PAUSE_JUSQU_AU`.
 * @param {string} aujourdhui Date du jour, `AAAA-MM-JJ`, en UTC.
 * @returns {{ collecter: boolean, raison: string }}
 */
export function decision(jusquAu, aujourdhui) {
  const date = (jusquAu ?? '').trim();
  if (date === '') {
    return { collecter: true, raison: 'Aucune pause en cours.' };
  }
  if (!FORMAT.test(date) || Number.isNaN(Date.parse(date))) {
    return {
      collecter: true,
      raison: `Pause illisible (« ${date} », attendu AAAA-MM-JJ) : on collecte.`,
    };
  }
  // La collecte reprend LE JOUR DIT, pas le lendemain : le quota est rendu à
  // la bascule de mois, et attendre un jour de plus n'ajouterait rien.
  if (date <= aujourdhui) {
    return { collecter: true, raison: `La pause a pris fin le ${date}.` };
  }
  const jours = Math.round((Date.parse(date) - Date.parse(aujourdhui)) / 86_400_000);
  if (jours > PAUSE_MAXIMALE_EN_JOURS) {
    return {
      collecter: true,
      raison: `Pause de ${jours} jours demandée jusqu'au ${date} : trop longue pour un quota mensuel, on collecte.`,
    };
  }
  return {
    collecter: false,
    raison: `Collecte en pause jusqu'au ${date} — quota de lectures Turso épuisé. Reprise automatique ce jour-là, sans intervention.`,
  };
}

/** La date du jour en UTC, comme la voit le cron de la forge. */
export function aujourdhuiUtc(maintenant = new Date()) {
  return maintenant.toISOString().slice(0, 10);
}

// Exécution directe, dans le workflow : `node scripts/pause-collecte.mjs`.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { collecter, raison } = decision(
    process.env['COLLECTE_EN_PAUSE_JUSQU_AU'],
    aujourdhuiUtc(),
  );
  console.log(raison);
  for (const [variable, ligne] of [
    ['GITHUB_OUTPUT', `collecter=${String(collecter)}`],
    ['GITHUB_STEP_SUMMARY', raison],
  ]) {
    const fichier = process.env[variable];
    if (fichier !== undefined && fichier !== '') appendFileSync(fichier, `${ligne}\n`);
  }
}
