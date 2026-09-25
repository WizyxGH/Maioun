/**
 * Vue carte des annonces (§36, §39).
 *
 * Leaflet + tuiles OpenStreetMap, ou vue satellite Esri (attribution obligatoire). Chaque
 * annonce géolocalisée est une pastille de prix ; un clic ouvre un aperçu avec
 * accès à la fiche. Les annonces sans coordonnées (source muette et adresse
 * non géocodée) sont comptées honnêtement plutôt que placées au hasard (§17).
 *
 * CE QUI SE SUPERPOSE EST REGROUPÉ. Une pastille par annonce tenait à soixante
 * annonces et s'effondrait à trois mille : le navigateur repeignait trois mille
 * nœuds à chaque image d'un déplacement — dix images par seconde sur un
 * ordinateur, mesuré. Chaque case de l'écran ne porte donc qu'un marqueur, et
 * seul ce qui est visible est monté. Un amas s'ouvre toujours : en zoomant, ou
 * par la liste de ses annonces quand plus aucun zoom ne le sépare.
 *
 * LES CONTOURS DE QUARTIERS se chargent APRÈS la carte, par un `import()` à
 * part : ils viennent de l'IGN, font un morceau de 22 ko (6 ko compressés) et
 * n'ont aucune raison de retarder l'affichage des annonces. Trente-trois
 * quartiers sur quatre-vingt-huit en ont un — on ne dessine que les limites
 * publiées, jamais une limite reconstituée.
 *
 * Chargé PARESSEUSEMENT (React.lazy) : Leaflet ne pèse sur le bundle initial
 * que si la vue carte est ouverte (§65).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PRIORITY_HOT } from '@maioun/shared';
import type { ListingView } from '../types.js';
import {
  formatAddress,
  formatArea,
  formatCity,
  formatPrice,
  formatPropertyType,
} from '../format.js';
import { photoVariant } from '../photo-variant.js';
import { iconMarkup } from './icons.js';

/**
 * Les couleurs des pastilles, empruntées au thème.
 *
 * LEAFLET NE PREND PAS DE CLASSES : ses marqueurs sont du HTML injecté, donc
 * des styles en ligne. Ces teintes étaient écrites en dur ici, une dizaine de
 * fois ; changer l'accent du site les laissait derrière. Les valeurs vivent
 * maintenant dans `styles.css` avec le reste du thème.
 */
const MAP = {
  pin: 'var(--color-map-pin)',
  ink: 'var(--color-map-ink)',
  hot: 'var(--color-map-hot)',
  hotInk: 'var(--color-map-hot-ink)',
  favorite: 'var(--color-map-favorite)',
  border: 'var(--color-map-border)',
  viewed: 'var(--color-map-viewed)',
  note: 'var(--color-map-note)',
} as const;
import { Select } from './ui/select.js';
import { clusterByPixelGrid, type MapCluster } from './map-clusters.js';
import {
  BOUNDARY_ACTIVE_CLASS,
  BOUNDARY_ATTRIBUTION,
  BOUNDARY_CLASS,
  boundaryOptions,
  loadDistrictBoundaries,
  loadInseeZones,
  inseeZoneOptions,
  INSEE_ZONE_CLASS,
  type DistrictBoundaries,
  type InseeZones,
} from '../district-boundaries.js';

/** Aperçu de 220 px de large, sur un écran à densité 2. */
const POPUP_PHOTO_WIDTH = 500;

/**
 * Côté d'une case de regroupement, en pixels. Une pastille de prix mesure une
 * soixantaine de pixels de large : en dessous, elles se chevauchent déjà.
 */
const CLUSTER_CELL_PX = 64;

/** Marge autour de l'écran : ce qui va entrer par le bord est déjà posé. */
const VIEWPORT_PAD = 0.25;

/** Centre par défaut : Nice. Utilisé quand aucune annonce n'est géolocalisée. */
const NICE_CENTER: [number, number] = [43.7009, 7.2683];

/**
 * Ce que `L.geoJSON` accepte. Déduit de Leaflet plutôt qu'importé de
 * `@types/geojson`, qui n'est pas une dépendance de l'interface.
 */
type GeoJsonInput = Parameters<typeof L.geoJSON>[0];

export type MapStyle = 'plan' | 'satellite';

/** Choix de fond mémorisé sur cet appareil : il suit la personne, pas le compte. */
const MAP_STYLE_KEY = 'maioun.mapStyle';

export function readMapStyle(): MapStyle {
  try {
    return localStorage.getItem(MAP_STYLE_KEY) === 'satellite' ? 'satellite' : 'plan';
  } catch {
    // Stockage bloqué (navigation privée) : le plan par défaut.
    return 'plan';
  }
}

function writeMapStyle(style: MapStyle): void {
  try {
    localStorage.setItem(MAP_STYLE_KEY, style);
  } catch {
    // Sans stockage, le choix vaut pour la visite en cours seulement.
  }
}

/** Crée le fond de carte demandé. La vue satellite montre la rue, la verdure, la mer. */
function tileLayer(style: MapStyle): L.TileLayer {
  if (style === 'satellite') {
    return L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      },
    );
  }
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
}

interface MapViewProps {
  readonly listings: readonly ListingView[];
  readonly onOpen: (id: string) => void;
}

/** Étapes de suivi qui signifient « j'ai déjà pris contact » (§35). */
const CONTACTED_STATUSES = new Set([
  'contacted',
  'replied',
  'visitOffered',
  'visitScheduled',
  'visited',
]);

/**
 * Pastille de prix, teintée selon la priorité (cohérente avec les cartes).
 *
 * Trois repères s'ajoutent, dans l'ordre où l'œil les cherche : cœur pour un
 * FAVORI, enveloppe pour une annonce déjà CONTACTÉE, œil pour une annonce déjà
 * CONSULTÉE — le badge « Consultée » des cartes, qui manquait ici : on rouvrait
 * sur la carte des fiches déjà lues. Les icônes sont celles de l'application,
 * pas des émojis, qui changent de dessin d'un téléphone à l'autre.
 */
function priceIcon(listing: ListingView): L.DivIcon {
  const hot = listing.actionPriority >= PRIORITY_HOT;
  // Même formatage que les cartes : centimes en virgule, « N/A » si le loyer
  // n'est pas publié — un tiret aurait l'air d'une valeur.
  const label = formatPrice(listing.price.value);
  const favorite = listing.favorite === true;
  const contacted = CONTACTED_STATUSES.has(listing.tracking);
  const viewed = listing.viewed === true;
  const ink = hot ? MAP.hotInk : MAP.ink;
  const badge = favorite
    ? iconMarkup('heart', hot ? MAP.hotInk : MAP.hot)
    : contacted
      ? iconMarkup('mail', ink)
      : viewed
        ? iconMarkup('eye', hot ? MAP.hotInk : MAP.viewed)
        : '';
  // Un favori garde une bordure dorée même quand il n'est pas « chaud », pour
  // rester repérable au milieu des autres pastilles.
  const border = favorite ? MAP.favorite : hot ? MAP.hot : MAP.border;

  return L.divIcon({
    className: '', // pas de styles Leaflet par défaut
    html: `<div style="
        transform: translate(-50%, -100%);
        display: inline-flex; align-items: center; gap: 4px; line-height: 1;
        padding: 4px 8px; border-radius: 999px;
        background: ${hot ? MAP.hot : MAP.pin}; color: ${hot ? MAP.hotInk : MAP.ink};
        border: ${favorite ? '2px' : '1px'} solid ${border};
        font: 600 12px system-ui, sans-serif; white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,.25); cursor: pointer;
        ${(contacted || viewed) && !favorite ? 'opacity: .75;' : ''}
      ">${badge}<span>${label}</span></div>`,
    iconSize: [0, 0],
  });
}

/** Coordonnées d'une annonce localisée — le filtre `located` l'a garantie. */
function positionOf(listing: ListingView): [number, number] {
  return [listing.latitude?.value as number, listing.longitude?.value as number];
}

/**
 * Pastille d'amas : le nombre d'annonces qu'il porte.
 *
 * La bordure reprend les repères des pastilles de prix, pour qu'un amas ne
 * cache pas ce qu'il contient : dorée s'il tient un favori, rouge s'il tient
 * une annonce à contacter maintenant.
 */
function clusterIcon(cluster: MapCluster<ListingView>): L.DivIcon {
  const count = cluster.items.length;
  const favorite = cluster.items.some((listing) => listing.favorite === true);
  const hot = cluster.items.some((listing) => listing.actionPriority >= PRIORITY_HOT);
  const size = count < 10 ? 32 : count < 100 ? 38 : 46;
  const border = favorite ? MAP.favorite : hot ? MAP.hot : MAP.border;
  return L.divIcon({
    className: '',
    html: `<div title="${count} annonces ici" style="
        transform: translate(-50%, -50%);
        display: flex; align-items: center; justify-content: center;
        width: ${size}px; height: ${size}px; border-radius: 999px;
        background: ${MAP.pin}; color: ${MAP.ink};
        border: ${favorite || hot ? '2px' : '1px'} solid ${border};
        font: 700 ${count < 100 ? 13 : 12}px system-ui, sans-serif;
        box-shadow: 0 1px 4px rgba(0,0,0,.25); cursor: pointer;
      ">${count}</div>`,
    iconSize: [0, 0],
  });
}

/**
 * Aperçu d'une annonce, construit À L'OUVERTURE de la bulle.
 *
 * Il l'était d'avance pour chaque marqueur : autant d'arbres DOM que
 * d'annonces, dont personne ne verra qu'un ou deux.
 */
function listingPopup(listing: ListingView, open: (id: string) => void): HTMLElement {
  const popup = document.createElement('div');
  popup.style.cssText = 'font:13px system-ui, sans-serif;max-width:220px';

  // Photo servie par le site d'origine, jamais recopiée chez nous. La bulle
  // n'existant qu'ouverte, l'adresse de l'image peut être posée tout de suite.
  const photoUrl = listing.imageUrls?.[0];
  if (photoUrl !== undefined) {
    const img = document.createElement('img');
    const variant = photoVariant(photoUrl, POPUP_PHOTO_WIDTH);
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.style.cssText =
      'display:block;width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:6px';
    img.addEventListener('error', () => {
      // Déclinaison réduite refusée : on retente l'originale, une fois.
      if (img.getAttribute('src') === variant && variant !== photoUrl) img.src = photoUrl;
      else img.remove();
    });
    img.src = variant;
    popup.append(img);
  }

  const title = document.createElement('strong');
  title.textContent = [
    formatPropertyType(listing.propertyType.value),
    formatPrice(listing.price.value),
    formatArea(listing.area.value),
  ].join(' · ');
  popup.append(title);

  /**
   * LA LIGNE DE LOCALISATION EST TOUJOURS LÀ, réduite à la commune quand la
   * voie n'est pas publiée — comme sur les cartes de la liste.
   *
   * Elle manquait, et le bouton « Voir l'annonce » prenait alors sa place,
   * juste sous le titre : la bulle d'une annonce sans voie se lisait comme si
   * son adresse ÉTAIT « Voir l'annonce ». Le libellé n'a jamais été dans les
   * données — c'était la place qu'il occupait qui trompait, et seulement pour
   * les annonces dont la source ne publie pas la voie.
   */
  const postal = listing.postalCode?.value ?? null;
  // Format postal français, comme partout ailleurs : « 06000 Nice ».
  const place = `${postal !== null ? `${postal} ` : ''}${formatCity(listing.city.value)}`;
  const street = listing.address.value !== null ? formatAddress(listing.address.value) : null;
  const addr = document.createElement('div');
  addr.textContent = street !== null ? `${street}, ${place}` : place;
  addr.style.cssText = `margin-top:2px;color:${MAP.note};font-size:12px`;
  popup.append(addr);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Voir l’annonce';
  button.style.cssText =
    'display:block;margin-top:6px;padding:4px 10px;border-radius:8px;' +
    `border:1px solid ${MAP.border};background:${MAP.pin};cursor:pointer;font:600 12px system-ui`;
  button.addEventListener('click', () => open(listing.id));
  popup.append(button);

  return popup;
}

/**
 * Liste des annonces d'un amas que le zoom ne sépare plus (mêmes coordonnées).
 *
 * TOUTES, sans coupure : c'est le seul chemin vers elles, et une annonce qui
 * disparaît en silence est pire qu'une carte lente.
 */
function clusterPopup(items: readonly ListingView[], open: (id: string) => void): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText =
    'font:13px system-ui, sans-serif;max-width:240px;max-height:240px;overflow-y:auto';
  const title = document.createElement('strong');
  title.textContent = `${items.length} annonces au même endroit`;
  box.append(title);
  for (const listing of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.textContent = [
      formatPropertyType(listing.propertyType.value),
      formatPrice(listing.price.value),
      formatArea(listing.area.value),
    ].join(' · ');
    row.style.cssText =
      'display:block;width:100%;margin-top:6px;padding:4px 8px;text-align:left;' +
      `border-radius:8px;border:1px solid ${MAP.border};background:${MAP.pin};cursor:pointer;` +
      'font:600 12px system-ui';
    row.addEventListener('click', () => open(listing.id));
    box.append(row);
  }
  return box;
}

/** Marqueur d'une annonce seule : la pastille de prix et son aperçu. */
function listingMarker(listing: ListingView, open: (id: string) => void): L.Marker {
  const marker = L.marker(positionOf(listing), { icon: priceIcon(listing) });
  marker.bindPopup(() => listingPopup(listing, open));
  return marker;
}

/**
 * Marqueur d'amas : un clic zoome dessus tant qu'un zoom peut le séparer, et
 * liste ses annonces quand plus aucun ne le peut.
 *
 * La bulle est posée à la main plutôt que liée au marqueur : liée, Leaflet
 * l'ouvrirait aussi sur les clics qui ne servent qu'à zoomer.
 */
function clusterMarker(
  map: L.Map,
  cluster: MapCluster<ListingView>,
  open: (id: string) => void,
): L.Marker {
  const marker = L.marker([cluster.latitude, cluster.longitude], { icon: clusterIcon(cluster) });
  marker.on('click', () => {
    const bounds = L.latLngBounds(cluster.items.map(positionOf));
    // La marge exigée vaut une case : le zoom retenu sépare vraiment l'amas
    // au lieu de le reformer aussitôt.
    const target = map.getBoundsZoom(bounds, false, L.point(CLUSTER_CELL_PX, CLUSTER_CELL_PX));
    if (target > map.getZoom()) {
      map.setView(bounds.getCenter(), target);
      return;
    }
    L.popup()
      .setLatLng(marker.getLatLng())
      .setContent(() => clusterPopup(cluster.items, open))
      .openOn(map);
  });
  return marker;
}

/**
 * Combien d'annonces de la liste sont sur la carte.
 *
 * Le total est celui de la LISTE, décomposé comme le compteur de la recherche
 * (« 61 résultats · 6 à vérifier ») : la part en ligne et la part à vérifier.
 */
function LocatedNote({
  located,
  listings,
}: {
  readonly located: readonly ListingView[];
  readonly listings: readonly ListingView[];
}): React.JSX.Element {
  const active = listings.filter((listing) => listing.lifecycle === 'active').length;
  const uncertain = listings.length - active;
  const plural = located.length > 1 ? 's' : '';
  return (
    <p className="mt-2 text-[0.85rem] text-muted-foreground">
      {located.length} annonce{plural} localisée{plural} sur les {listings.length} de la liste
      {uncertain > 0 ? ` (${active} en ligne, ${uncertain} à vérifier)` : ''} — les autres ne
      publient ni coordonnées ni adresse géocodable.
    </p>
  );
}

export default function MapView({ listings, onOpen }: MapViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>(readMapStyle);
  const [boundaries, setBoundaries] = useState<DistrictBoundaries | null>(null);
  /** Les zones que l'INSEE nomme et que nos quartiers ignorent. */
  const [inseeZones, setInseeZones] = useState<InseeZones | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  // Le tracé de chaque quartier, pour le mettre en évidence sans le redessiner.
  const shapesRef = useRef(new Map<string, L.Polygon>());
  /** Les zones sans quartier, à part : elles se cadrent, elles ne filtrent pas. */
  const zoneShapesRef = useRef(new Map<string, L.Polygon>());
  // `onOpen` change à chaque rendu : une ref évite de reconstruire les marqueurs.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Mémorisé : changer de fond re-rend le composant, et des marqueurs
  // reconstruits recadreraient la carte là où l'on venait de zoomer.
  const located = useMemo(
    () =>
      listings.filter(
        (listing) =>
          typeof listing.latitude?.value === 'number' &&
          typeof listing.longitude?.value === 'number',
      ),
    [listings],
  );

  // Les quartiers proposés dans la liste : ceux qui ont vraiment un contour.
  const districtOptions = useMemo(
    () => (boundaries === null ? [] : boundaryOptions(boundaries)),
    [boundaries],
  );

  /** Les zones sans quartier, nommées : la liste est le seul endroit qui le dit. */
  const zoneOptions = useMemo(
    () => (inseeZones === null ? [] : inseeZoneOptions(inseeZones)),
    [inseeZones],
  );

  // Initialisation de la carte, une seule fois.
  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(NICE_CENTER, 13);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      /**
       * ON ARRÊTE L'ANIMATION AVANT DE DÉTRUIRE LA CARTE.
       *
       * `fitBounds` lance un zoom ANIMÉ. Basculer de la carte vers la liste
       * démonte le composant pendant ce mouvement : Leaflet retire ses
       * panneaux, puis la transition CSS se termine et son gestionnaire va
       * chercher la position d'un panneau qui n'existe plus —
       * « Cannot read properties of undefined (reading '_leaflet_pos') »,
       * relevé deux fois dans la console d'un usage ordinaire.
       *
       * L'erreur ne cassait rien de visible, la carte étant déjà partie ; mais
       * une exception non rattrapée à chaque bascule pollue la console au point
       * d'y noyer celles qui comptent.
       */
      map.stop();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tilesRef.current = null;
    };
  }, []);

  // LES CONTOURS ARRIVENT APRÈS : la carte s'affiche sans les attendre, et un
  // réseau qui refuse ce morceau lui laisse une carte entière, sans quartiers.
  useEffect(() => {
    let monte = true;
    void loadDistrictBoundaries().then(
      (data) => {
        if (monte) setBoundaries(data);
      },
      () => undefined,
    );
    // Même fichier, donc aucune requête de plus : elles arrivent avec les
    // contours et remplissent la carte là où nos quartiers ne disent rien.
    void loadInseeZones().then(
      (data) => {
        if (monte) setInseeZones(data);
      },
      () => undefined,
    );
    return () => {
      monte = false;
    };
  }, []);

  /**
   * LES ZONES SANS QUARTIER, dessinées SOUS les contours.
   *
   * Près de la moitié de Nice restait blanche : notre table de quartiers et le
   * découpage de l'INSEE ne se recouvrent qu'en partie. On les dessine sous
   * leur nom INSEE — contour officiel, nom officiel, rien de deviné.
   *
   * Elles ne sont ni cliquables ni cochables : ce ne sont pas des quartiers.
   * Leur seul rôle est que la carte ne soit pas trouée, et l'infobulle dit ce
   * qu'elles sont.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || inseeZones === null) return;
    const group = L.geoJSON(inseeZones as unknown as GeoJsonInput, {
      style: () => ({ className: INSEE_ZONE_CLASS, interactive: false }),
      onEachFeature: (feature, layer) => {
        const { slug, label } = feature.properties as { slug: string; label: string };
        layer.bindTooltip(`${label} — hors quartier`, { sticky: true });
        // Dans le même registre que les quartiers : la liste doit pouvoir les
        // cadrer, faute de quoi la choisir ne ferait rien.
        zoneShapesRef.current.set(slug, layer as L.Polygon);
      },
    }).addTo(map);
    // DERRIÈRE LES CONTOURS : un quartier voisin ne doit pas se faire recouvrir
    // par une zone qui n'en est pas un.
    group.bringToBack();
    return () => {
      group.remove();
      zoneShapesRef.current = new Map<string, L.Polygon>();
    };
  }, [inseeZones]);

  // Le fond se remplace sous les marqueurs, sans toucher ni à eux ni au cadrage.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    tilesRef.current?.remove();
    const tiles = tileLayer(mapStyle).addTo(map);
    tiles.bringToBack();
    tilesRef.current = tiles;
    writeMapStyle(mapStyle);
  }, [mapStyle]);

  /**
   * Les contours, posés sous les marqueurs.
   *
   * SOUS, et c'est tout l'enjeu : Leaflet range les tracés dans son panneau
   * « overlay » et les marqueurs dans le sien, plus haut. Une pastille de prix
   * posée sur un quartier reste donc cliquable — le polygone ne l'avale pas.
   *
   * Un clic sur un contour le choisit et s'arrête là ; un clic sur le fond
   * remonte jusqu'à la carte et efface le choix.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || boundaries === null) return;
    const shapes = new Map<string, L.Polygon>();

    const group = L.geoJSON(boundaries as unknown as GeoJsonInput, {
      // La Licence Ouverte 2.0 des contours exige de citer l'IGN et l'INSEE.
      attribution: BOUNDARY_ATTRIBUTION,
      style: () => ({ className: BOUNDARY_CLASS, interactive: true }),
      onEachFeature: (feature, layer) => {
        const { slug } = feature.properties as { slug: string };
        shapes.set(slug, layer as L.Polygon);
        layer.on('click', (event: L.LeafletMouseEvent) => {
          // Sans cela, la carte reçoit le même clic et efface aussitôt.
          L.DomEvent.stopPropagation(event);
          setDistrict(slug);
        });
      },
    }).addTo(map);
    shapesRef.current = shapes;

    const efface = (): void => setDistrict(null);
    map.on('click', efface);

    return () => {
      map.off('click', efface);
      group.remove();
      shapesRef.current = new Map<string, L.Polygon>();
    };
  }, [boundaries]);

  // La mise en évidence se joue en CSS : une classe suffit, et le thème
  // clair/sombre suit les tokens sans que ce composant les connaisse.
  useEffect(() => {
    for (const [slug, shape] of shapesRef.current) {
      const actif = slug === district;
      const element = shape.getElement();
      element?.classList.toggle(BOUNDARY_ACTIVE_CLASS, actif);
      // Devant ses voisins, sinon un contour mitoyen recouvre son trait.
      //
      // SEULEMENT SI LE CONTOUR EST DESSINÉ. `bringToFront` remonte jusqu'au
      // rendu de Leaflet, qui lit la position de l'élément : appelé sur une
      // forme pas encore posée — ou déjà retirée —, il jette
      // « Cannot read properties of undefined (reading '_leaflet_pos') », et
      // c'est toute la page qui tombe. Le test de la barre de recherche l'a
      // attrapé une fois sous charge, sans qu'on sache le reproduire isolément.
      if (actif && element != null) shape.bringToFront();
    }
  }, [district, boundaries]);

  // Les annonces déjà cadrées : le cadrage ne se refait que si l'ENSEMBLE
  // change. Mettre un favori ou ouvrir une fiche renvoie une nouvelle liste au
  // même contenu — la carte sautait alors hors du quartier qu'on regardait.
  const fittedIdsRef = useRef<readonly string[]>([]);

  // Marqueurs : regroupés, limités à ce qui est visible, redessinés à la fin
  // des gestes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (map === null || layer === null) return;
    const open = (id: string): void => onOpenRef.current(id);
    const positions = located.map(positionOf);

    // Une bulle ouverte survit aux gestes : remplacer les marqueurs sous elle
    // la refermerait au milieu d'une lecture. Le redessin attend donc sa
    // fermeture, comme il attendait la fin du geste.
    let reading = false;
    let awaited = false;

    const draw = (): void => {
      if (reading) {
        awaited = true;
        return;
      }
      const zoom = map.getZoom();
      const size = map.getSize();
      // Conteneur sans dimensions (carte encore masquée, rendu de test) : on ne
      // sait pas ce qui est visible, on garde donc tout.
      const view = size.x > 0 && size.y > 0 ? map.getBounds().pad(VIEWPORT_PAD) : null;
      const visible =
        view === null ? located : located.filter((_, index) => view.contains(positions[index]!));

      const clusters = clusterByPixelGrid(
        visible,
        positionOf,
        (latitude, longitude) => {
          const point = map.project([latitude, longitude], zoom);
          return [point.x, point.y];
        },
        CLUSTER_CELL_PX,
      );

      layer.clearLayers();
      for (const cluster of clusters) {
        layer.addLayer(
          cluster.items.length === 1
            ? listingMarker(cluster.items[0]!, open)
            : clusterMarker(map, cluster, open),
        );
      }
    };

    const onPopupOpen = (): void => {
      reading = true;
    };
    const onPopupClose = (): void => {
      reading = false;
      if (awaited) {
        awaited = false;
        draw();
      }
    };

    // FIN DE GESTE, et non chaque image : pendant un déplacement Leaflet
    // translate le calque entier, il n'y a rien à reconstruire avant l'arrêt.
    map.on('moveend', draw);
    map.on('zoomend', draw);
    map.on('popupopen', onPopupOpen);
    map.on('popupclose', onPopupClose);

    const sameSet =
      fittedIdsRef.current.length === located.length &&
      located.every((listing, index) => fittedIdsRef.current[index] === listing.id);
    if (!sameSet && positions.length > 0) {
      fittedIdsRef.current = located.map((listing) => listing.id);
      /**
       * SANS ANIMATION, ET CE N'EST PAS UN DÉTAIL.
       *
       * Un zoom animé se termine par une transition CSS dont Leaflet écoute la
       * fin. Or ce cadrage-ci se déclenche à CHAQUE changement de la liste —
       * donc à chaque lettre tapée dans la recherche —, et la carte disparaît
       * dès que le filtre ne rend plus rien. La transition se termine alors sur
       * une carte détruite, et son gestionnaire va chercher la position d'un
       * panneau qui n'existe plus : « Cannot read properties of undefined
       * (reading '_leaflet_pos') », relevé par le scénario de la barre de
       * recherche. `map.stop()` à la destruction ne suffit pas — il annule
       * l'animation de Leaflet, pas la transition du navigateur.
       *
       * Rien à regretter : recadrer en glissant à chaque lettre tapée était
       * de toute façon plus étourdissant qu'agréable. Le zoom d'un clic sur un
       * quartier, lui, reste animé — la carte, elle, ne s'en va pas.
       *
       * Le cadrage finit par `moveend`, qui redessine : inutile de dessiner
       * deux fois pour la même arrivée.
       */
      map.fitBounds(L.latLngBounds(positions).pad(0.15), { maxZoom: 15, animate: false });
    } else {
      draw();
    }

    return () => {
      map.off('moveend', draw);
      map.off('zoomend', draw);
      map.off('popupopen', onPopupOpen);
      map.off('popupclose', onPopupClose);
    };
  }, [located]);

  return (
    <div className="relative lg:flex lg:h-full lg:flex-col">
      {/* LA HAUTEUR SE CALCULE, elle n'est plus devinée.
        `65vh` obligeait à faire défiler la page pour voir le bas de la carte
        sur un téléphone : l'en-tête, la barre de filtres et la barre de
        navigation basse occupent déjà un bon tiers de l'écran, et `vh` compte
        la fenêtre BARRE D'ADRESSE MASQUÉE — donc plus grande qu'elle ne l'est
        vraiment. `dvh` suit la fenêtre réellement visible, et l'on retire ce
        que le reste de l'écran occupe — en-tête, barre de filtres et barre de
        navigation basse, mesurés : environ vingt-trois rem. Le plancher évite
        qu'une carte devienne inutilisable sur un écran très bas (téléphone en
        paysage).

        VINGT REM NE SUFFISAIENT PLUS. La barre de puces s'affiche désormais dès
        l'arrivée — elle montre le budget et la surface d'ouverture, qui
        filtraient sans se montrer —, et cette rangée prend une trentaine de
        pixels de plus. La carte dépassait alors le bas de l'écran de vingt et un
        pixels sur un 390×740 : assez peu pour tenir de justesse sur un rendu et
        déborder sur un autre, ce qui est exactement le genre de marge qu'il ne
        faut pas laisser.

        AU-DELÀ DE `lg`, LA HAUTEUR NE SE CALCULE PLUS ICI : la carte REMPLIT la
        colonne que la page lui donne. Une hauteur écrite ici — `100dvh` moins
        sept rem — ignorait ce qui la surplombe (en-tête, barre d'outils, puces
        de filtres) et la note « n annonces localisées » posée dessous : sur un
        ordinateur, le bas de la carte passait sous l'écran. */}
      <div
        ref={containerRef}
        data-testid="map-view"
        className="border-border h-[max(260px,calc(100dvh-23rem))] w-full overflow-hidden rounded-xl border sm:h-[max(360px,calc(100dvh-17rem))] lg:h-auto lg:min-h-0 lg:flex-1"
      />
      {/* En haut à droite : le coin libre, les boutons de zoom sont à gauche.
        Au-dessus des panneaux de Leaflet, qui montent jusqu'à z-index 1000. */}
      <div
        role="group"
        aria-label="Fond de carte"
        className="absolute top-2.5 right-2.5 z-[1000] flex overflow-hidden rounded-lg border border-border bg-card text-[0.8rem] font-medium shadow-md"
      >
        {(
          [
            ['plan', 'Plan'],
            ['satellite', 'Satellite'],
          ] as const
        ).map(([style, label]) => (
          <button
            key={style}
            type="button"
            aria-pressed={mapStyle === style}
            onClick={() => setMapStyle(style)}
            className={`px-3 py-1.5 ${
              mapStyle === style
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* LE CONTOUR SE CLIQUE, MAIS PAS SEULEMENT.
        Un polygone SVG n'est pas au clavier : le rendre focalisable
        ajouterait trente-trois arrêts de tabulation dans une carte, ce qui
        est pire que rien. Cette liste donne le même geste en un seul arrêt —
        choisir un quartier le met en évidence, le cadre, et son NOM reste
        affiché dans le contrôle. C'est aussi par elle qu'on découvre quels
        quartiers ont une limite publiée : le reste de la carte ne le dit pas.

        Elle ne paraît qu'une fois les contours chargés : un menu vide, ou un
        menu qui pousse la carte à l'arrivée du morceau, ne vaut rien. */}
      {districtOptions.length > 0 && (
        <div className="absolute top-12 right-2.5 z-[1000]">
          <label htmlFor="map-district" className="sr-only">
            Délimiter un quartier
          </label>
          <Select
            id="map-district"
            size="sm"
            value={district ?? ''}
            onChange={(event) => {
              const slug = event.target.value === '' ? null : event.target.value;
              setDistrict(slug);
              // Choisi dans la liste, le quartier est cadré : sans souris, on
              // ne sait pas où regarder. Cliqué sur la carte, il ne l'est pas
              // — on était déjà dessus, et la carte sauterait sous le doigt.
              const shape =
                slug === null
                  ? undefined
                  : (shapesRef.current.get(slug) ?? zoneShapesRef.current.get(slug));
              if (shape !== undefined) mapRef.current?.fitBounds(shape.getBounds().pad(0.1));
            }}
            className="bg-card shadow-md"
          >
            <option value="">Quartier…</option>
            <optgroup label="Quartiers">
              {districtOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            {/* LES ZONES SANS QUARTIER, TOUTES NOMMÉES. Un contour sur une carte
              ne se lit qu'à la souris : sans cette liste, soixante-huit zones
              n'auraient de nom que pour qui les survole, et aucun pour qui
              navigue au clavier. L'intitulé du groupe dit ce qu'elles sont —
              elles se cadrent, elles ne se cochent pas dans les critères. */}
            {zoneOptions.length > 0 && (
              <optgroup label="Zones sans quartier (INSEE)">
                {zoneOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>
      )}
      {/* §17 : les annonces non localisables sont dites, pas placées au hasard. */}
      {located.length < listings.length && <LocatedNote located={located} listings={listings} />}
    </div>
  );
}
