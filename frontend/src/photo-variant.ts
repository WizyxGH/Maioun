/**
 * Une déclinaison plus légère d'une photo, quand l'hébergeur en sert une.
 *
 * Les photos restent chez la source : on ne fait que choisir, parmi les tailles
 * que son CDN propose déjà, celle qui suffit à l'affichage. Un hébergeur absent
 * de la table rend l'URL telle quelle — on ne devine pas une taille.
 *
 * Chaque règle a été vérifiée sur de vraies photos de la base le 2026-09-15.
 * Si une déclinaison échoue malgré tout, le carrousel retente l'originale.
 */

/**
 * Largeurs demandées à l'hébergeur, en pixels RÉELS, selon l'usage et l'état du
 * réseau. Table partagée : la carte, la fiche et le plein écran doivent choisir
 * leurs tailles au même endroit, sinon la fiche en demande une et le plein
 * écran une autre sans qu'aucune ne sache ce que l'autre a déjà chargé.
 *
 * `card` : ~450 px de carte sur un écran à densité 2. `detail` : ~600 px de
 * fiche. `full` : la BORNE du plein écran — au-delà, les hébergeurs observés
 * n'ont plus rien de plus grand et se mettent à agrandir, ce qui alourdit sans
 * rien montrer de mieux.
 */
export const PHOTO_WIDTH = {
  card: { normal: 800, constrained: 500 },
  detail: { normal: 1200, constrained: 800 },
  full: { normal: 1600, constrained: 1000 },
} as const;

type Rule = (url: URL, width: number) => URL | null;

/**
 * `*.staticlbi.com` : le premier segment fixe la largeur (`/1600xauto/`,
 * `/original/`), toute largeur est calculée à la volée. Il AGRANDIT une photo
 * plus petite : on ne touche donc qu'aux largeurs connues plus grandes que la
 * cible, et à `original` (1280 à 1600 px observés). `/wa/`, souvent minuscule,
 * reste tel quel. 1600 px 385 ko → 800 px 125 ko.
 */
const staticlbi: Rule = (url, width) => {
  if (!url.hostname.endsWith('.staticlbi.com')) return null;
  const match = /^\/(original|(\d+)xauto)\//.exec(url.pathname);
  if (match === null) return null;
  if (match[2] !== undefined && Number(match[2]) <= width) return null;
  url.pathname = url.pathname.replace(match[1]!, `${width}xauto`);
  return url;
};

/**
 * `media.apimo.pro` : `_<côté>-original.jpg`, où le nombre borne le plus grand
 * côté. Calculé à la volée, sans agrandir. 1920 px 320 ko → 1024 px 113 ko.
 */
const apimo: Rule = (url, width) => {
  if (url.hostname !== 'media.apimo.pro') return null;
  const match = /_(\d+)-original(\.\w+)$/.exec(url.pathname);
  if (match === null || Number(match[1]) <= width) return null;
  url.pathname = url.pathname.replace(match[0], `_${width}-original${match[2]!}`);
  return url;
};

/**
 * `media.studapart.com` : deux tailles seulement, `large` (1300 px, 82 ko) et
 * `small` (570 px, 18 ko). La petite ne sert que si elle suffit.
 */
const STUDAPART_SMALL = 570;
const studapart: Rule = (url, width) => {
  if (url.hostname !== 'media.studapart.com' || width > STUDAPART_SMALL) return null;
  const match = /^\/property_images(_large)?\//.exec(url.pathname);
  if (match === null) return null;
  url.pathname = url.pathname.replace(match[0], '/property_images_small/');
  return url;
};

/**
 * `file.bienici.com` : `width`, `height` et `fit=inside` redimensionnent sans
 * recadrer ni agrandir. 1600 px 400 ko → 800 px 111 ko.
 */
const bienici: Rule = (url, width) => {
  if (url.hostname !== 'file.bienici.com' || url.search !== '') return null;
  url.search = `?width=${width}&height=${width}&fit=inside`;
  return url;
};

/**
 * `mms.seloger.com` : `w` n'est pas couvert par `ci_seal`. Il agrandit, mais
 * les originaux font 1440 px et nos cibles restent en deçà. Une URL qui porte
 * déjà `w` ou `h` est déjà réduite. 1440 px 33 ko → 800 px 11 ko.
 */
const seloger: Rule = (url, width) => {
  if (url.hostname !== 'mms.seloger.com') return null;
  if (url.searchParams.has('w') || url.searchParams.has('h')) return null;
  url.searchParams.set('w', String(width));
  return url;
};

const RULES: readonly Rule[] = [staticlbi, apimo, studapart, bienici, seloger];

/**
 * L'URL de la même photo à environ `width` pixels de large, ou l'URL d'origine
 * quand l'hébergeur n'est pas connu ou n'a rien de plus léger.
 */
export function photoVariant(original: string, width: number): string {
  let parsed: URL;
  try {
    parsed = new URL(original);
  } catch {
    return original;
  }
  if (parsed.protocol !== 'https:') return original;
  for (const rule of RULES) {
    const rewritten = rule(new URL(parsed), width);
    if (rewritten !== null) return rewritten.toString();
  }
  return original;
}
