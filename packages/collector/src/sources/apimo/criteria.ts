/**
 * Les blocs « critères » d'une fiche Apimo : sommaire, prestations, surfaces,
 * mentions légales et diagnostics.
 *
 * Les gabarits varient d'une agence à l'autre (classes, ordre des blocs), mais
 * le balisage des lignes reste le même : `<li>Intitulé <span>Valeur</span></li>`.
 * On lit donc les lignes par leur forme plutôt que par leur conteneur.
 */

import type * as cheerio from 'cheerio';
import { cleanText, comparable } from '../../normalization/text.js';
import { parseFrenchNumber } from '../../normalization/parse-number.js';

export interface ApimoCriteria {
  /** Couples intitulé → valeur, dans l'ordre de la page (doublons compris). */
  readonly pairs: readonly (readonly [string, string])[];
  /** Prestations sans valeur : « Ascenseur », « Double vitrage ». */
  readonly services: readonly string[];
  /** Pastilles d'en-tête dont la valeur précède l'intitulé : « 2 chambres ». */
  readonly badges: readonly string[];
}

/** Une distance de proximité (« Bus 10 mètres ») : pas un atout du logement. */
const DISTANCE = /^\d+(?:[.,]\d+)?\s*(?:m|metres?|km|kilometres?|min|minutes?)$/;

/**
 * Lieux des listes « Proximités ». Sans valeur, ces lignes ressemblent aux
 * prestations ; les confondre ferait de « Parking public » un parking privatif.
 */
const NEARBY =
  /^(bus|tram|metro|gare|gare tgv|taxi|aeroport|autoroute|route principale|commerces?|supermarche|centre ville|cinema|ecoles?|ecole \w+|college|lycee|universite|creche|garderie|medecin|hopital.*|pharmacie|parc|plage|mer|port|tennis|golf|salle de sport|parking public|piscine publique)$/;

type Li = ReturnType<cheerio.CheerioAPI>;

/** `true` si la ligne commence par sa valeur (`<span>2 chambres</span>`). */
function startsWithSpan($: cheerio.CheerioAPI, item: Li): boolean {
  const first = item
    .contents()
    .toArray()
    .find((node) => node.type !== 'text' || cleanText($(node).text()) !== '');
  return first !== undefined && first.type === 'tag' && first.name === 'span';
}

/** `true` si la liste sans valeurs est une liste de proximités. */
function isNearbyList($: cheerio.CheerioAPI, list: Li, items: readonly string[]): boolean {
  const classes = list
    .parents()
    .slice(0, 3)
    .toArray()
    .map((node) => $(node).attr('class') ?? '')
    .join(' ');
  if (/proximit/i.test(classes)) return true;
  if (/services|prestation/i.test(classes)) return false;
  const nearby = items.filter((item) => NEARBY.test(comparable(item))).length;
  return nearby * 2 >= items.length;
}

export function extractCriteria($: cheerio.CheerioAPI): ApimoCriteria {
  const pairs: (readonly [string, string])[] = [];
  const badges: string[] = [];
  const bare = new Map<Li, string[]>();

  $('.module-property-info ul').each((_i, ul) => {
    const list = $(ul);
    const items: string[] = [];
    list.children('li').each((_j, li) => {
      const item = $(li);
      if (item.find('a').length > 0) return;
      const value = cleanText(item.find('span').first().text());
      if (value === '') {
        const text = cleanText(item.text());
        // Une prestation est un intitulé court : le loyer d'en-tête ou la phrase
        // d'estimation énergétique n'en sont pas.
        if (text !== '' && text.length <= 50 && !/\d\s*€/.test(text)) items.push(text);
        return;
      }
      if (startsWithSpan($, item)) {
        badges.push(cleanText(item.text()));
        return;
      }
      const label = cleanText(item.clone().children('span').remove().end().text());
      if (label === '' || DISTANCE.test(comparable(value))) return;
      pairs.push([label, value]);
    });
    if (items.length > 0) bare.set(list, items);
  });

  const services = [...bare]
    .filter(([list, items]) => !isNearbyList($, list, items))
    .flatMap(([, items]) => items);
  return { pairs, services, badges };
}

/**
 * La valeur du premier intitulé reconnu.
 *
 * Comparaison souple — sans accents ni casse — parce que la même idée s'écrit
 * « Provision sur charges récupérables » chez l'un et « Charges » chez l'autre.
 */
export function criterion(
  criteria: ApimoCriteria,
  patterns: readonly RegExp[],
): string | undefined {
  for (const [label, value] of criteria.pairs) {
    const plain = comparable(label);
    if (patterns.some((pattern) => pattern.test(plain))) return value;
  }
  return undefined;
}

function amount(text: string | undefined): number | undefined {
  const fragment = text?.match(/\d[\d\s.,]*/)?.[0];
  const value = fragment === undefined ? null : parseFrenchNumber(fragment);
  return value === null ? undefined : value;
}

/**
 * Honoraires du locataire, état des lieux compris : c'est la somme versée à
 * l'entrée. Apimo les publie sur deux lignes distinctes.
 */
export function apimoFeesText(criteria: ApimoCriteria): string | undefined {
  const fees = amount(criterion(criteria, [/^honoraires locataire/]));
  if (fees === undefined) return undefined;
  const inventory = amount(criterion(criteria, [/etat des lieux/])) ?? 0;
  return `${Math.round((fees + inventory) * 100) / 100} €`;
}

/** Charges, dépôt de garantie et honoraires, lus dans les mentions légales. */
export function apimoMoney(criteria: ApimoCriteria): {
  chargesText: string | undefined;
  depositText: string | undefined;
  feesText: string | undefined;
} {
  return {
    // Les charges étaient le manque le plus coûteux : 13 % de couverture sur
    // tout l'inventaire, alors qu'Apimo les publie sous un intitulé stable.
    chargesText: criterion(criteria, [/provision.*charge/, /^charges?$/, /charges? locative/]),
    depositText: criterion(criteria, [/^depot de garantie/]),
    feesText: apimoFeesText(criteria),
  };
}

/** « 1er » → `1`, « 3ème » → `3`, « Rez-de-chaussée » → `0`. */
export function apimoFloor(criteria: ApimoCriteria): string | undefined {
  const value = criterion(criteria, [/^etage$/]);
  if (value === undefined) return undefined;
  if (/rez.de.chauss/i.test(value)) return '0';
  return /^(\d{1,2})/.exec(value)?.[1];
}

/**
 * Nombre de chambres : la pastille d'en-tête, sinon le décompte des pièces
 * « Chambre » du bloc Surfaces. Ce bloc liste une ligne par chambre : lu tel
 * quel, « 1 Chambre » donnait une chambre à un trois-pièces qui en a deux.
 */
export function apimoBedrooms(criteria: ApimoCriteria): number | undefined {
  for (const badge of criteria.badges) {
    const match = /^(\d+)\s*chambres?$/i.exec(badge);
    if (match?.[1] !== undefined) return Number.parseInt(match[1], 10);
  }
  let count = 0;
  for (const [label, value] of criteria.pairs) {
    const match = /^(\d+)\s+chambres?$/.exec(comparable(label));
    if (match?.[1] !== undefined && /m\s*(?:²|2)/.test(value)) {
      count += Number.parseInt(match[1], 10);
    }
  }
  return count > 0 ? count : undefined;
}

const LETTERS = 'ABCDEFG';

/**
 * Étiquette « CLASSE ÉNERGIE » : sept flèches, celle du bien est plus haute que
 * les autres. Son rang de haut en bas donne la lettre.
 */
function letterFromArrows(svg: string): string | undefined {
  const arrows = [...svg.matchAll(/<polygon\b[^>]*\bpoints="([^"]+)"/gi)].map((match) => {
    const ys = (match[1] ?? '')
      .trim()
      .split(/[\s,]+/)
      .filter((_value, index) => index % 2 === 1)
      .map(Number);
    return { top: Math.min(...ys), height: Math.max(...ys) - Math.min(...ys) };
  });
  if (arrows.length !== LETTERS.length) return undefined;
  const sorted = [...arrows].sort((a, b) => a.top - b.top);
  const heights = sorted.map((arrow) => arrow.height).sort((a, b) => a - b);
  const tallest = sorted.find((arrow) => arrow.height === heights[heights.length - 1]);
  // Une seule flèche nettement plus haute, sinon rien n'est désigné.
  if (tallest === undefined || tallest.height < 1.5 * (heights[heights.length - 2] ?? 0)) {
    return undefined;
  }
  return LETTERS[sorted.indexOf(tallest)];
}

/**
 * Ancienne étiquette : la consommation et les sept tranches imprimées
 * (« ≤ 50 », « 51 - 90 »… « > 450 »). La lettre est la tranche où tombe la
 * valeur, selon le barème que l'étiquette affiche elle-même.
 */
function letterFromBands(svg: string): string | undefined {
  const texts = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/gi)].map((match) =>
    cleanText((match[1] ?? '').replace(/&gt;/g, '>').replace(/&lt;/g, '<')),
  );
  const unit = texts.findIndex((text) => /kwh/i.test(text));
  const value = unit > 0 ? amount(texts[unit - 1]) : undefined;
  const bands = texts
    .map((text) => /^(?:[≤<]\s*(\d+)|(\d+)\s*-\s*(\d+)|>\s*(\d+))$/.exec(text))
    .filter((match): match is RegExpExecArray => match !== null);
  if (value === undefined || bands.length !== LETTERS.length) return undefined;
  const index = bands.findIndex((band) => {
    const upper = band[1] ?? band[3];
    return upper === undefined || value <= Number(upper) + 0.999;
  });
  return index >= 0 ? LETTERS[index] : undefined;
}

/**
 * Classe énergie (DPE), lue dans l'étiquette du bien.
 *
 * Apimo ne l'écrit nulle part en texte : elle n'existe que dans un SVG embarqué
 * en `data:`. Aucune des fiches Apimo n'avait donc de DPE.
 */
export function apimoDpe($: cheerio.CheerioAPI): string | undefined {
  for (const img of $('.energy-diagnostics img, .diagnostic img').toArray()) {
    const src = $(img).attr('src') ?? '';
    const base64 = /^data:image\/svg\+xml;base64,(.+)$/.exec(src)?.[1];
    if (base64 === undefined) continue;
    const svg = Buffer.from(base64, 'base64').toString('utf8');
    // L'étiquette climat (GES) vient ensuite : on ne lit que celle de l'énergie.
    if (!/kwh/i.test(svg)) continue;
    return letterFromArrows(svg) ?? letterFromBands(svg);
  }
  return undefined;
}
