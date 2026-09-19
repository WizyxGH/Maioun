/**
 * Engendre les contours de quartiers dessinés sur la carte.
 *
 * LA SOURCE. Il n'existe AUCUN jeu ouvert des quartiers de Nice : le portail
 * de la Métropole ne publie que les six « territoires » de la ville, dix fois
 * plus larges qu'un quartier. Le seul découpage infra-communal officiel et
 * publié est l'IRIS de l'INSEE, diffusé par l'IGN — et ses libellés SONT des
 * noms de quartiers (« Mont Boron », « Carabacel », « Le Port »).
 *
 *   Contours…IRIS®, INSEE et IGN, édition 2026-01-01
 *   https://geoservices.ign.fr/contoursiris
 *   WFS Géoplateforme, couche STATISTICALUNITS.IRIS:contours_iris
 *   Licence Ouverte / Open Licence 2.0 (Etalab) — attribution exigée
 *
 * ON NE RAPPROCHE QUE CE QUI EST IDENTIQUE. Un IRIS ne donne son contour à un
 * quartier que si son nom est LE nom du quartier, une fois mis en forme
 * comparable, et qu'aucun autre IRIS ne porte ce nom en composant. La seconde
 * condition est la plus importante : « Cimiez » est un IRIS parmi « Cimiez-
 * Monastère » et « Cimiez-Valrose », et son seul contour couvrirait un tiers
 * du quartier sous le nom du tout. Réunir les trois serait une reconstitution,
 * pas une donnée publiée — on préfère laisser Cimiez sans contour.
 *
 * LA GÉOMÉTRIE EST SIMPLIFIÉE. La précision utile est le quartier, pas le
 * trottoir : Douglas-Peucker à quinze mètres et cinq décimales.
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

const retenus = [];
const ecartes = [];
for (const district of NICE_DISTRICTS) {
  const formes = new Set([district.label, ...(district.aliases ?? [])].map(comparable));
  const exacts = iris.filter((entry) => formes.has(entry.forme));
  const composants = iris.filter(
    (entry) =>
      !exacts.includes(entry) &&
      [...formes].some((forme) => new RegExp(`(^|\\s)${forme}($|\\s)`).test(entry.forme)),
  );
  if (exacts.length === 1 && composants.length === 0) retenus.push({ district, entry: exacts[0] });
  else if (exacts.length > 0 || composants.length > 0)
    ecartes.push([district.slug, [...exacts, ...composants].map((entry) => entry.nom)]);
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

function simplifier(geometry) {
  const polygones =
    geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
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

const features = retenus
  .map(({ district, entry }) => ({
    type: 'Feature',
    properties: { slug: district.slug },
    geometry: { type: 'MultiPolygon', coordinates: simplifier(entry.geometry) },
  }))
  .sort((a, b) => a.properties.slug.localeCompare(b.properties.slug));

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
 * Contours…IRIS®, © INSEE et IGN, édition 2026-01-01, extraits par le WFS de
 * la Géoplateforme (couche STATISTICALUNITS.IRIS:contours_iris) pour la commune
 * de Nice (INSEE 06088), sous Licence Ouverte / Open Licence 2.0 (Etalab).
 * https://geoservices.ign.fr/contoursiris
 *
 * L'ATTRIBUTION EST OBLIGATOIRE : la carte l'affiche à côté de celles
 * d'OpenStreetMap et d'Esri.
 *
 * ${features.length} quartiers sur ${String(NICE_DISTRICTS.length)} ont un contour. Les autres n'ont pas d'IRIS
 * portant EXACTEMENT leur nom, ou en ont plusieurs qui le portent en composant
 * — réunir ceux-là serait reconstituer une limite, pas la lire.
 *
 * Géométrie simplifiée (Douglas-Peucker ${String(TOLERANCE_M)} m, ${String(DECIMALES)} décimales) : ${String(sommets)} sommets.
 * Ce fichier n'est importé que DYNAMIQUEMENT, par la carte : il ne pèse pas sur
 * le premier affichage, que GitHub Pages sert sans brotli et cache dix minutes.
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

console.log(`${String(features.length)} quartiers, ${String(sommets)} sommets → ${OUT}`);
console.log(`écartés (nom éclaté ou ambigu) : ${String(ecartes.length)}`);
for (const [slug, noms] of ecartes) console.log(`  ${slug} ← ${noms.join(', ')}`);
