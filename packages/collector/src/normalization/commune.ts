/**
 * Ce qui a le droit de s'appeler une commune, et ce qui n'a rien à y faire.
 *
 * POURQUOI CE FILTRE EXISTE. Le champ « commune » se remplit de ce qui traîne
 * autour du code postal, et un digest SeLoger écrit son bouton juste après :
 * « Nice, 06100 Voir l'annonce ». Vingt-trois occurrences portaient donc
 * « voir l annonce » comme commune, et l'adresse affichée devenait « 06200 Voir
 * L Annonce ». Le même piège avait déjà rangé « a 17 km de nice » chez L'Adresse.
 *
 * ON REFUSE, ON NE RÉPARE PAS. Une valeur douteuse laisse le champ VIDE : une
 * commune absente se voit et se cherche, une commune fausse se croit. Et l'on
 * ne déduit JAMAIS la commune du code postal — 06340 en désigne trois.
 *
 * LA TABLE DU PÉRIMÈTRE SERT DE JUGE pour dire oui à coup sûr. Elle ne sert pas
 * à dire non : Antibes et Menton n'y sont pas et restent de vraies communes.
 */

import { comparable } from './text.js';
import { PERIMETER_COMMUNES } from '../sources/shared/communes.js';

/** Les communes suivies, en forme comparable : « cap-d-ail » → « cap d ail ». */
const PERIMETER_NAMES = new Set(
  PERIMETER_COMMUNES.map((commune) => comparable(commune.slug.replace(/-/g, ' '))),
);

/**
 * « SAINT » ABRÉGÉ EN « ST », et la commune se dédouble.
 *
 * La FNAIM écrit « St Laurent du Var », les autres « Saint-Laurent-du-Var ».
 * Les deux passaient tels quels : DEUX communes en base pour une seule sur la
 * carte, 45 annonces d'un côté et 16 de l'autre au relevé du 2026-09-25. Le
 * filtre par commune compare à l'identique — ces seize-là étaient invisibles à
 * qui cherchait à Saint-Laurent-du-Var, sans que rien ne le dise.
 *
 * ON NE CORRIGE QUE CE QU'ON RECONNAÎT. L'abréviation est développée, puis la
 * table du périmètre doit reconnaître le résultat : sinon on rend le texte tel
 * quel. Développer à l'aveugle ferait de « St[udio] » une commune, et ce module
 * existe précisément pour ne rien inventer.
 */
const SAINT_ABREGE = /(^|\s)st(e?)(\s)/g;

/** La forme canonique d'une commune du périmètre, ou `null` si inconnue. */
function communeDuPerimetre(name: string): string | null {
  if (PERIMETER_NAMES.has(name)) return name;
  // « Ste » vaut « Sainte », pas « Saint » : les confondre inventerait une
  // commune voisine le jour où le périmètre en comptera une.
  const developpe = name.replace(
    SAINT_ABREGE,
    (_, avant: string, feminin: string, apres: string) => `${avant}saint${feminin}${apres}`,
  );
  return PERIMETER_NAMES.has(developpe) ? developpe : null;
}

/**
 * LES MOTS D'UN BOUTON. Aucune commune de France n'en porte un, et c'est par
 * eux que le libellé d'action se reconnaît quel que soit le portail.
 */
const ACTION_WORDS = new Set([
  'voir',
  'revoir',
  'cliquez',
  'cliquer',
  'ici',
  'annonce',
  'annonces',
  'offre',
  'offres',
  'detail',
  'details',
  'contact',
  'contacter',
  'contactez',
  'appeler',
  'appelez',
  'savoir',
  'decouvrir',
  'decouvrez',
  'consulter',
  'consultez',
  'postuler',
  'reserver',
  'visiter',
  'telecharger',
  'inscrire',
  'inscrivez',
  'repondre',
  'envoyer',
  'suivant',
  'suivante',
]);

/**
 * UNE POSITION N'EST PAS UNE COMMUNE. « À 17 km de Nice », « Drap / 12km de
 * Nice » : ces tournures situent par rapport à une autre ville sans jamais
 * nommer celle du bien de façon exploitable.
 */
const APPROXIMATE =
  /\b\d+\s*km\b|\bkm\b|\b(?:proche|pres|a cote|autour|environs?|alentours|aux portes)\s+(?:de|du|des|d)\b/;

/** Au-delà, on lit une phrase et non un nom de lieu. */
const MAX_WORDS = 5;

/** `true` si cette valeur peut être le nom d'une commune. */
export function isPlausibleCommune(raw: string | null | undefined): boolean {
  const name = comparable(raw);
  if (name === '') return false;
  if (communeDuPerimetre(name) !== null) return true;
  // Un code postal seul ne nomme personne, et aucune commune ne s'écrit sans lettre.
  if (!/[a-z]/.test(name)) return false;
  const words = name.split(' ');
  if (words.length > MAX_WORDS) return false;
  if (APPROXIMATE.test(name)) return false;
  return !words.some((word) => ACTION_WORDS.has(word));
}

/**
 * La commune en forme comparable, ou `null` si ce n'en est pas une.
 *
 * C'est le passage obligé de toutes les sources : ce qu'une d'elles a mal lu
 * s'arrête ici plutôt que de s'afficher comme une adresse.
 */
export function plausibleCommune(raw: string | null | undefined): string | null {
  if (!isPlausibleCommune(raw)) return null;
  const name = comparable(raw);
  // Une commune du périmètre repart sous SON écriture, pas celle de la source :
  // deux orthographes pour un même lieu, c'est un filtre qui en oublie la moitié.
  return communeDuPerimetre(name) ?? name;
}

/**
 * Les mots qui LIENT deux morceaux d'un nom de commune.
 *
 * « Cagnes-sur-Mer », « Saint-Laurent-du-Var » : ces particules s'écrivent en
 * minuscules au milieu d'un nom propre, et les refuser couperait la commune.
 */
const PARTICULES = new Set(['sur', 'de', 'du', 'des', 'la', 'le', 'les', 'en', 'd', 'l', 'lès']);

/**
 * La commune écrite juste AVANT une position dans le texte, et rien de plus.
 *
 * ON REMONTE MOT À MOT, et LA MAJUSCULE FAIT LA FRONTIÈRE : un nom de commune
 * en porte une, « comprises » non. Sans majuscule — certains digests écrivent
 * tout en minuscules —, on ne rend RIEN plutôt qu'une ville inventée.
 */
export function communeNameBefore(text: string, index: number): string | undefined {
  const avant = text.slice(0, index).replace(/[,\s]+$/, '');
  const mots = avant.split(/\s+/).filter((mot) => mot !== '');

  const retenus: string[] = [];
  // Quatre mots au plus : « Saint-Laurent-du-Var » n'en fait qu'un, « Villeneuve
  // Loubet » deux ; au-delà on lit une phrase, pas un nom de lieu.
  for (let i = mots.length - 1; i >= 0 && retenus.length < 4; i -= 1) {
    const nu = (mots[i] ?? '').replace(/[^A-Za-zÀ-ÿ'’-]/g, '');
    if (nu === '') break;
    if (!/^[A-ZÀ-Ý]/.test(nu) && !PARTICULES.has(nu.toLowerCase())) break;
    retenus.unshift(nu);
  }

  // Une particule en tête ne nomme rien : « de 06000 » n'est pas une commune.
  while (retenus.length > 0 && PARTICULES.has((retenus[0] ?? '').toLowerCase())) retenus.shift();
  if (retenus.length === 0) return undefined;
  const nom = retenus.join(' ').replace(/\s+/g, ' ').trim();
  return isPlausibleCommune(nom) ? nom : undefined;
}

/** Une commune et son code postal, lus dans un texte. */
export interface CommuneAndPostalCode {
  readonly city: string;
  readonly postalCode: string;
}

/** Une virgule, puis un code postal : « Nice, 06100 ». */
const COMMA_THEN_POSTAL = /,\s*(\d{5})(?!\d)/;

/**
 * « Nice, 06100 » — la commune écrite AVANT son code postal, virgule comprise.
 *
 * LA VIRGULE EST LE SIGNAL : elle dit que le nom qui précède le code est bien
 * la commune, et donc que ce qui SUIT le code ne l'est pas. C'est la forme des
 * titres et des blocs SeLoger, et c'est elle qui empêche de prendre le bouton
 * qui vient ensuite pour une ville.
 */
export function communeWithPostalCode(text: string): CommuneAndPostalCode | undefined {
  const match = COMMA_THEN_POSTAL.exec(text);
  const postalCode = match?.[1];
  if (postalCode === undefined || match === null) return undefined;
  const city = communeNameBefore(text, match.index);
  return city === undefined ? undefined : { city, postalCode };
}
