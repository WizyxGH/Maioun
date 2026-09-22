/**
 * Engendre les contours de quartiers dessinés sur la carte.
 *
 * LA GÉOMÉTRIE. Il n'existe AUCUN jeu ouvert des quartiers de Nice : le portail
 * de la Métropole ne publie que les six « territoires » de la ville, dix fois
 * plus larges qu'un quartier. Le seul découpage infra-communal officiel et
 * publié est l'IRIS de l'INSEE, diffusé par l'IGN.
 *
 *   Contours…IRIS®, INSEE et IGN, édition 2026-01-01
 *   https://geoservices.ign.fr/contoursiris
 *   WFS Géoplateforme, couche STATISTICALUNITS.IRIS:contours_iris
 *   Licence Ouverte / Open Licence 2.0 (Etalab) — attribution exigée
 *
 * LE NOMMAGE, ET RIEN QUE LE NOMMAGE.
 *
 *   https://fr.wikipedia.org/wiki/Liste_des_quartiers_de_Nice
 *   Wikipédia, CC BY-SA — AUCUNE géométrie n'en vient
 *
 * Cette liste sert d'ARBITRE : elle dit que la mairie a découpé la ville en
 * 41 quartiers EN REGROUPANT les 146 IRIS de l'INSEE. C'est ce qui autorise la
 * réunion faite ici — Cimiez est un quartier, « Cimiez-Monastère » en est un
 * morceau, et les rassembler n'invente aucune limite. Elle confirme aussi que
 * « Nice Nord », « Nice Ouest » et « Nice Est » n'en sont pas : nos trois
 * secteurs restent donc sans contour.
 *
 * LA RÈGLE, EN DEUX TEMPS.
 *
 * 1. REVENDICATION. Un de nos quartiers revendique un IRIS dès que son nom
 *    apparaît en COMPOSANT ENTIER du nom de l'IRIS — où qu'il soit, pas
 *    seulement en tête.
 * 2. ATTRIBUTION. Il ne le REÇOIT que si le nom de l'IRIS COMMENCE par le
 *    sien, le reste étant séparé par un tiret ou une espace.
 *
 * LE GARDE-FOU PRIME SUR LA RÈGLE : un IRIS revendiqué par plus d'un quartier
 * n'est donné à aucun. « Bellet-Magnan » nomme Bellet et Magnan, « Cimiez-
 * Valrose » nomme Cimiez et Valrose : on ne tranche pas à leur place. C'est
 * bien la revendication sur TOUT composant qui compte, et non le seul premier
 * — sinon Cimiez emporterait une zone que Valrose réclame aussi.
 *
 * LA RÉUNION EST EXACTE, PAS APPROCHÉE. Les IRIS d'une commune forment une
 * couverture topologiquement propre : chaque frontière intérieure apparaît une
 * fois dans un sens et une fois dans l'autre (vérifié : 8 194 arêtes appariées,
 * zéro doublon de même sens). On retire donc les arêtes qui s'annulent et l'on
 * recoud le reste — aucune bibliothèque de géométrie, aucun résultat approché,
 * et surtout aucun trait qui traverserait le quartier réuni.
 *
 * LA GÉOMÉTRIE EST SIMPLIFIÉE APRÈS la réunion. La précision utile est le
 * quartier, pas le trottoir : Douglas-Peucker à quinze mètres, cinq décimales.
 *
 * Usage : pnpm --filter @maioun/frontend run districts
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { NICE_DISTRICTS } from '@maioun/shared';

const OUT = fileURLToPath(new URL('../src/district-boundaries.generated.ts', import.meta.url));

const WFS =
  'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
  '&TYPENAMES=STATISTICALUNITS.IRIS:contours_iris&OUTPUTFORMAT=application/json' +
  '&SRSNAME=EPSG:4326&COUNT=1000&CQL_FILTER=code_insee=%2706088%27';

/** Tolérance de simplification, en mètres. */
const TOLERANCE_M = 15;
/** Décimales conservées : cinq valent un mètre environ. */
const DECIMALES = 5;

const UA = 'MaiounBot/0.1 (+https://github.com/WizyxGH/Maioun)';

/** Même mise en forme que `canonicalDistrict`, article initial en moins. */
function comparable(input) {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\bst\b/g, 'saint')
      .replace(/\bste\b/g, 'sainte')
      // « La Californie » et « Californie » sont le même lieu : la table nomme
      // déjà « Le Port » et « La Bornala » avec l'article en alias.
      .replace(/^(le|la|les|l) /, '')
  );
}

const response = await fetch(WFS, { headers: { 'User-Agent': UA } });
if (!response.ok) throw new Error(`WFS ${String(response.status)}`);
const iris = (await response.json()).features.map((feature) => ({
  nom: feature.properties.nom_iris,
  forme: comparable(feature.properties.nom_iris),
  geometry: feature.geometry,
}));

// --- Rapprochement --------------------------------------------------------

/** Les secteurs ne sont pas des quartiers : la liste de référence le confirme. */
const quartiers = NICE_DISTRICTS.filter((district) => district.sector !== true);

function formesDe(district) {
  return [district.label, ...(district.aliases ?? [])].map(comparable);
}

/** Le nom du quartier apparaît en composant entier du nom de l'IRIS. */
function revendique(formes, forme) {
  return formes.some((f) => new RegExp(`(^|\\s)${f}($|\\s)`).test(forme));
}

/** Le nom de l'IRIS commence par celui du quartier (tiret et espace valent
 *  séparateur : `comparable` les a déjà ramenés à une espace). */
function commencePar(formes, forme) {
  return formes.some((f) => forme === f || forme.startsWith(`${f} `));
}

/**
 * Attribue les IRIS aux quartiers.
 *
 * `revendiquer` décide qui PEUT prétendre à un IRIS — et donc qui le bloque.
 * L'attribution, elle, se fait toujours sur le préfixe.
 */
function attribuer(revendiquer) {
  const parQuartier = new Map(quartiers.map((district) => [district.slug, []]));
  const disputes = [];
  for (const entry of iris) {
    const pretendants = quartiers.filter((district) =>
      revendiquer(formesDe(district), entry.forme),
    );
    if (pretendants.length > 1) {
      disputes.push([entry.nom, pretendants.map((district) => district.slug)]);
      continue;
    }
    for (const district of pretendants) {
      if (commencePar(formesDe(district), entry.forme)) parQuartier.get(district.slug).push(entry);
    }
  }
  const couverts = [...parQuartier].filter(([, parts]) => parts.length > 0);
  return { couverts, disputes };
}

// Deux lectures du garde-fou, pour savoir ce que la stricte coûte.
const large = attribuer(commencePar);
const strict = attribuer(revendique);
const { couverts, disputes } = strict;

// --- Réunion exacte des IRIS d'un quartier --------------------------------

/**
 * Réunit plusieurs IRIS en un seul contour, SANS trait intérieur.
 *
 * Les IRIS d'une commune forment une couverture propre : une frontière entre
 * deux d'entre eux est décrite deux fois, une par voisin, dans des sens
 * opposés. Retirer toute arête dont l'inverse est présente dans le groupe
 * supprime donc exactement les frontières intérieures, sans toucher au bord.
 * Il ne reste qu'à recoudre les arêtes survivantes bout à bout.
 *
 * Fait AVANT la simplification, sur les coordonnées brutes : deux arêtes ne
 * s'annulent que si elles coïncident au sommet près.
 */
function reunir(parts) {
  const cle = (a, b) => `${a[0]},${a[1]}|${b[0]},${b[1]}`;
  const aretes = new Map();
  for (const part of parts) {
    const polygones =
      part.geometry.type === 'MultiPolygon'
        ? part.geometry.coordinates
        : [part.geometry.coordinates];
    for (const polygone of polygones) {
      for (const ring of polygone) {
        for (let i = 0; i < ring.length - 1; i += 1)
          aretes.set(cle(ring[i], ring[i + 1]), [ring[i], ring[i + 1]]);
      }
    }
  }
  // Ce qui s'annule est intérieur au quartier réuni.
  const bord = [...aretes].filter(([, [a, b]]) => !aretes.has(cle(b, a))).map(([, arete]) => arete);

  // Recoud : depuis chaque sommet, l'arête qui en part et n'a pas servi.
  const partantDe = new Map();
  for (const arete of bord) {
    const depart = `${arete[0][0]},${arete[0][1]}`;
    if (!partantDe.has(depart)) partantDe.set(depart, []);
    partantDe.get(depart).push(arete);
  }
  const anneaux = [];
  const vues = new Set();
  for (const depart of bord) {
    if (vues.has(depart)) continue;
    const anneau = [depart[0]];
    let arete = depart;
    while (arete !== undefined && !vues.has(arete)) {
      vues.add(arete);
      anneau.push(arete[1]);
      const suite = partantDe.get(`${arete[1][0]},${arete[1][1]}`) ?? [];
      arete = suite.find((candidate) => !vues.has(candidate));
    }
    // Un anneau qui ne se referme pas trahirait une topologie trouée : on
    // préfère l'annoncer que dessiner une forme ouverte.
    const [premier, dernier] = [anneau[0], anneau[anneau.length - 1]];
    if (premier[0] !== dernier[0] || premier[1] !== dernier[1])
      throw new Error(`anneau ouvert en réunissant ${parts.map((part) => part.nom).join(' + ')}`);
    if (anneau.length >= 4) anneaux.push(anneau);
  }

  // Extérieurs et trous se distinguent au sens de parcours, que la réunion
  // conserve. Chaque trou revient à l'extérieur qui le contient.
  const aire = (ring) => {
    let total = 0;
    for (let i = 0; i < ring.length - 1; i += 1)
      total += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return total / 2;
  };
  const dedans = (point, ring) => {
    let dans = false;
    for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (
        yi > point[1] !== yj > point[1] &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
      )
        dans = !dans;
    }
    return dans;
  };
  const sens = Math.sign(
    aire(anneaux.reduce((a, b) => (Math.abs(aire(a)) > Math.abs(aire(b)) ? a : b))),
  );
  const exterieurs = anneaux.filter((ring) => Math.sign(aire(ring)) === sens);
  const trous = anneaux.filter((ring) => Math.sign(aire(ring)) !== sens);
  const polygones = exterieurs.map((ring) => [ring]);
  for (const trou of trous) {
    const hote = polygones.find((polygone) => dedans(trou[0], polygone[0]));
    // Un « trou » qui n'est dans rien n'en est pas un : on le dessine plein.
    if (hote === undefined) polygones.push([trou]);
    else hote.push(trou);
  }
  return polygones;
}

// --- Simplification -------------------------------------------------------

/** Un degré de longitude vaut moins qu'un de latitude : corrigé pour Nice. */
const KX = Math.cos((43.7 * Math.PI) / 180);
const TOLERANCE = TOLERANCE_M / 111_320;

function distance2(point, a, b) {
  const px = (point[0] - a[0]) * KX;
  const py = point[1] - a[1];
  const bx = (b[0] - a[0]) * KX;
  const by = b[1] - a[1];
  const longueur = bx * bx + by * by;
  const t = longueur === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / longueur));
  const dx = px - bx * t;
  const dy = py - by * t;
  return dx * dx + dy * dy;
}

function douglasPeucker(ring) {
  if (ring.length < 4) return ring;
  const garde = new Array(ring.length).fill(false);
  garde[0] = true;
  garde[ring.length - 1] = true;
  const pile = [[0, ring.length - 1]];
  const seuil = TOLERANCE * TOLERANCE;
  while (pile.length > 0) {
    const [a, b] = pile.pop();
    let pire = 0;
    let index = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = distance2(ring[i], ring[a], ring[b]);
      if (d > pire) {
        pire = d;
        index = i;
      }
    }
    if (pire > seuil) {
      garde[index] = true;
      pile.push([a, index], [index, b]);
    }
  }
  const sortie = ring.filter((_, i) => garde[i]);
  return sortie.length >= 4 ? sortie : ring;
}

function arrondir(ring) {
  const arrondi = ring.map(([x, y]) => [
    Number(x.toFixed(DECIMALES)),
    Number(y.toFixed(DECIMALES)),
  ]);
  // L'arrondi peut coller deux sommets voisins : le doublon ne sert à rien.
  const sortie = [arrondi[0]];
  for (const point of arrondi.slice(1)) {
    const dernier = sortie[sortie.length - 1];
    if (point[0] !== dernier[0] || point[1] !== dernier[1]) sortie.push(point);
  }
  return sortie;
}

function simplifier(polygones) {
  const sortie = [];
  for (const polygone of polygones) {
    const anneaux = [];
    for (const ring of polygone) {
      const reduit = arrondir(douglasPeucker(ring));
      // Un anneau réduit à un triangle dégénéré ne dessine rien : on le laisse.
      if (reduit.length >= 4 && reduit[0][0] === reduit[reduit.length - 1][0]) anneaux.push(reduit);
    }
    if (anneaux.length > 0) sortie.push(anneaux);
  }
  return sortie;
}

const features = couverts
  .map(([slug, parts]) => ({
    type: 'Feature',
    properties: { slug },
    geometry: { type: 'MultiPolygon', coordinates: simplifier(reunir(parts)) },
  }))
  .sort((a, b) => a.properties.slug.localeCompare(b.properties.slug));

const reunis = couverts.reduce((total, [, parts]) => total + parts.length, 0);

const sommets = features.reduce(
  (total, feature) =>
    total +
    feature.geometry.coordinates.reduce(
      (t, polygone) => t + polygone.reduce((n, ring) => n + ring.length, 0),
      0,
    ),
  0,
);

const source = `/**
 * ENGENDRÉ — ne pas modifier à la main.
 * Reconstruire avec \`pnpm --filter @maioun/frontend run districts\`.
 *
 * GÉOMÉTRIE : Contours…IRIS®, © INSEE et IGN, édition 2026-01-01, extraits par
 * le WFS de la Géoplateforme (couche STATISTICALUNITS.IRIS:contours_iris) pour
 * la commune de Nice (INSEE 06088), sous Licence Ouverte / Open Licence 2.0
 * (Etalab). https://geoservices.ign.fr/contoursiris
 *
 * L'ATTRIBUTION EST OBLIGATOIRE : la carte l'affiche à côté de celles
 * d'OpenStreetMap et d'Esri.
 *
 * NOMMAGE : https://fr.wikipedia.org/wiki/Liste_des_quartiers_de_Nice
 * (Wikipédia, CC BY-SA). Cette liste n'apporte AUCUNE géométrie ; elle sert
 * d'arbitre de nommage — elle établit que la mairie a découpé Nice en
 * 41 quartiers EN REGROUPANT les 146 IRIS, ce qui autorise la réunion faite
 * ici, et confirme que « Nice Nord », « Ouest » et « Est » n'en sont pas.
 *
 * ${String(features.length)} quartiers sur ${String(NICE_DISTRICTS.length)} ont un contour, réunion exacte de ${String(reunis)} IRIS.
 * Un IRIS revendiqué par deux de nos quartiers n'est donné à aucun (${String(disputes.length)} cas) :
 * on ne tranche pas à leur place. Les autres quartiers n'ont aucun IRIS dont
 * le nom commence par le leur.
 *
 * Géométrie simplifiée APRÈS réunion (Douglas-Peucker ${String(TOLERANCE_M)} m, ${String(DECIMALES)} décimales) :
 * ${String(sommets)} sommets. Ce fichier n'est importé que DYNAMIQUEMENT, par la carte : il
 * ne pèse pas sur le premier affichage, que GitHub Pages sert sans brotli et
 * ne garde en cache que dix minutes.
 */

/**
 * Le strict nécessaire de GeoJSON, écrit ici : \`@types/geojson\` n'est pas une
 * dépendance de l'interface, et trois interfaces coûtent moins qu'un paquet.
 */
export interface DistrictBoundary {
  readonly type: 'Feature';
  /** La seule donnée portée par un contour : le quartier qu'il délimite. */
  readonly properties: { readonly slug: string };
  readonly geometry: {
    readonly type: 'MultiPolygon';
    /** Polygones → anneaux → sommets \`[longitude, latitude]\`. */
    readonly coordinates: readonly (readonly (readonly (readonly [number, number])[])[])[];
  };
}

export interface DistrictBoundaries {
  readonly type: 'FeatureCollection';
  readonly features: readonly DistrictBoundary[];
}

export const DISTRICT_BOUNDARIES: DistrictBoundaries = ${JSON.stringify({
  type: 'FeatureCollection',
  features,
})} as DistrictBoundaries;
`;

// La configuration du dépôt, sinon `prettier --check` refuse le fichier engendré.
const options = await prettier.resolveConfig(OUT);
writeFileSync(OUT, await prettier.format(source, { ...options, parser: 'typescript' }), 'utf8');

console.log(
  `${String(features.length)} quartiers, ${String(reunis)} IRIS réunis, ${String(sommets)} sommets → ${OUT}`,
);
console.log(
  `garde-fou : préfixe seul ${String(large.couverts.length)} quartiers / ${String(large.disputes.length)} IRIS disputés ;` +
    ` tout composant (appliqué) ${String(strict.couverts.length)} / ${String(strict.disputes.length)}`,
);
console.log('IRIS écartés, revendiqués par plusieurs quartiers :');
for (const [nom, slugs] of disputes) console.log(`  ${nom} ← ${slugs.join(', ')}`);
console.log('Quartiers couverts :');
for (const [slug, parts] of [...couverts].sort())
  console.log(`  ${slug} ← ${parts.map((part) => part.nom).join(' + ')}`);
