/**
 * Le DPE des gabarits Apimo, lu dans l'ADRESSE des images de diagnostic.
 *
 * POURQUOI SANS CHARGER L'IMAGE. Apimo rend l'étiquette sous forme d'image
 * `/fr/diagnostic/{id}/1/{kWh}` pour l'énergie et `/2/{CO₂}` pour le climat.
 * Le robots.txt de ces sites interdit `/fr/diagnostic/` : on lit donc les deux
 * nombres dans l'adresse, qui est déjà dans la page, et on n'ouvre rien.
 *
 * DEUX GABARITS, UN SEUL CALCUL. « classic » range ces images dans
 * `.diagnostics`, « free7 » dans l'`article` de la fiche : seul le sélecteur
 * change, et les treize lignes qui suivaient étaient recopiées à l'identique
 * dans les deux parseurs. Le sélecteur reste donc à l'appelant, qui est le seul
 * à connaître son gabarit.
 */

import type * as cheerio from 'cheerio';
import { dpeFromValues } from '../../normalization/parse-listing-fields.js';

/**
 * La classe DPE déduite des deux images de diagnostic visées par `selector`,
 * ou `undefined` si l'une des deux manque.
 *
 * `selector` doit viser les images de diagnostic de la fiche, par exemple
 * `.diagnostics img[src*="/fr/diagnostic/"]`.
 */
export function dpeFromDiagnosticImages(
  $: cheerio.CheerioAPI,
  selector: string,
): string | undefined {
  const value = (kind: 1 | 2): number | undefined => {
    const src = $(selector)
      .toArray()
      .map((img) => $(img).attr('src') ?? '')
      .find((path) => new RegExp(`/${kind}/\\d+(?:\\.\\d+)?$`).test(path));
    const number = Number(src?.split('/').pop());
    return src !== undefined && Number.isFinite(number) ? number : undefined;
  };
  const kwh = value(1);
  const co2 = value(2);
  return kwh !== undefined && co2 !== undefined ? dpeFromValues(kwh, co2) : undefined;
}
