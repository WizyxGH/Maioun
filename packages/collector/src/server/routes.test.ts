/**
 * L'ordre d'une liste ne lève jamais d'erreur : il est seulement FAUX, et il
 * faut le remarquer à l'œil. Deux tris l'étaient, relevés le 2026-09-05 sur
 * l'inventaire réel — d'où des tests sur la clause elle-même.
 */

import { describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { rentForBudget } from '@maioun/shared';
import { listColumns, reasonlessScores } from '../core/list-payload.js';
import {
  buildListQuery,
  buildPriceHistogram,
  capListPhotos,
  etagMatches,
  listItemJson,
  RENT_FOR_BUDGET_SQL,
  route,
  rowToListing,
} from './routes.js';
import { parseLiveFilters } from './filters.js';

const vueMoi = (row: Record<string, unknown>): Record<string, unknown> => rowToListing(row);

const query = (search: string) =>
  buildListQuery(new URL(`https://exemple.invalid/api/listings${search}`));

describe('la liste d’un visiteur sans compte', () => {
  /**
   * LA CONSULTATION LIBRE MONTRAIT UNE LISTE VIDE. La liste ne gardait que les
   * annonces « dans les critères » du lecteur, lues dans SES scores ; un
   * visiteur n'en possède aucun. Le 2026-09-11 : « 0 annonce sur 0 ».
   */
  const anonyme = (search = '') =>
    buildListQuery(new URL(`https://exemple.invalid/api/listings${search}`), undefined, true);

  it('ne dépend PAS de scores qu’il n’a pas', () => {
    expect(anonyme().filter).not.toContain('matches_criteria');
  });

  it('lui montre le catalogue : des logements en ligne, dans la commune', () => {
    const { filter } = anonyme();
    expect(filter).toContain("lifecycle != 'inactive'");
    expect(filter).toContain("property_type NOT IN ('parking', 'commercial')");
    expect(filter).toContain("city IN ('nice')");
  });

  it('classe par nouveauté : sans score, la priorité est la même partout', () => {
    expect(anonyme().orderBy).toBe('COALESCE(listings.published_at, listings.first_seen_at) DESC');
    expect(anonyme('?sort=price').orderBy).toBe('price IS NULL, price ASC');
  });

  it('garde le repli par score quand aucun critère live n’est fourni', () => {
    expect(query('').filter).toContain('matches_criteria');
  });

  it('applique les critères live avant les scores persistés', () => {
    const { filter } = buildListQuery(
      new URL('https://exemple.invalid/api/listings'),
      { cities: ['nice'], maxPrice: 750, minArea: 20 },
      false,
    );
    expect(filter).toContain('LOWER(listings.city) IN (?)');
    expect(filter).toContain(RENT_FOR_BUDGET_SQL);
    expect(filter).not.toContain('COALESCE(sc.matches_criteria, 0) = 1');
  });
});

describe('pagination : ce que l’URL peut contenir de travers', () => {
  /**
   * `?limit=abc` donnait `NaN` : `Math.max` le propage, et libsql REFUSE de
   * lier une valeur non finie (« Only finite numbers … can be passed as
   * arguments »). La requête levait, et une adresse mal tapée — ou une sonde —
   * ressortait en 500 au lieu d'une liste.
   */
  it('retombe sur le défaut quand le nombre est illisible', () => {
    expect(query('?limit=abc').limit).toBe(30);
    expect(query('?offset=abc').offset).toBe(0);
    expect(query('?limit=&offset=').limit).toBe(30);
  });

  it('borne les valeurs extrêmes au lieu de les transmettre', () => {
    expect(query('?limit=99999').limit).toBe(500);
    expect(query('?limit=0').limit).toBe(1);
    expect(query('?limit=-5').limit).toBe(1);
    expect(query('?offset=-5').offset).toBe(0);
  });

  it('respecte une pagination valide', () => {
    expect(query('?limit=50&offset=100').limit).toBe(50);
    expect(query('?limit=50&offset=100').offset).toBe(100);
  });

  it('ne rend jamais autre chose qu’un entier fini', () => {
    // Le contrat que libsql exige : sans lui, la requête ne part même pas.
    for (const search of ['?limit=abc', '?limit=NaN', '?offset=Infinity', '?limit=1e999']) {
      expect(Number.isFinite(query(search).limit)).toBe(true);
      expect(Number.isFinite(query(search).offset)).toBe(true);
    }
  });
});

describe('ordre de la liste', () => {
  it('compte « récent » sur la date AFFICHÉE, pas sur la dernière vue', () => {
    // `last_seen_at` se rafraîchit à chaque collecte : une annonce en ligne
    // depuis trois mois y paraissait plus récente qu'une trouvée le matin
    // même. Et la seule découverte ne suffisait pas non plus : la carte
    // affiche la publication dès que la source la donne.
    expect(query('?sort=recent').orderBy).toBe(
      'COALESCE(listings.published_at, listings.first_seen_at) DESC',
    );
    expect(query('?sort=recent').orderBy).not.toContain('last_seen_at');
  });

  it('relègue les annonces SANS PRIX en fin de tri par prix', () => {
    // SQLite classe les valeurs nulles en tête d'un tri croissant : les cinq
    // premières du classement « moins cher » n'avaient aucun prix.
    expect(query('?sort=price').orderBy).toBe('price IS NULL, price ASC');
  });

  it('relègue les annonces SANS SURFACE en fin de tri par surface', () => {
    // Même piège qu'avec le prix, dans l'autre sens : SQLite place les valeurs
    // nulles en tête d'un tri décroissant, si bien qu'une annonce qui ne dit
    // pas sa surface serait présentée comme la plus grande.
    expect(query('?sort=area').orderBy).toBe('area IS NULL, area DESC, sc.action_priority DESC');
  });

  it('départage la priorité par la même date, pour la même raison', () => {
    // `sc.` : la priorité vient du score DU COMPTE, pas de la fiche.
    const attendu = `sc.action_priority DESC, ${'COALESCE(listings.published_at, listings.first_seen_at) DESC'}`;
    expect(query('').orderBy).toBe(attendu);
    expect(query('?sort=priority').orderBy).toBe(attendu);
  });

  it('borne la pagination', () => {
    expect(query('?limit=9999').limit).toBe(500);
    expect(query('?limit=0').limit).toBe(1);
    expect(query('?offset=-5').offset).toBe(0);
  });

  it('masque par défaut les archivées, les louées et les hors-critères', () => {
    const filter = query('').filter;
    // La pertinence vient du SCORE DU COMPTE depuis le multi-compte : elle
    // dépend de qui regarde, pas de la fiche.
    expect(filter).toContain('COALESCE(sc.matches_criteria, 0) = 1');
    expect(filter).toContain('rented = 0');
    expect(filter).toContain('COALESCE(us.archived, 0) = 0');
    // Fermée aux candidatures par sa source : rangée d'office avec les archivées.
    expect(filter).toContain("json_extract(listings.payload, '$.applicationStatus')");
    expect(query('?archived=true').filter).not.toContain('applicationStatus');
  });

  it('archive d’office ce que la source dit loué ou retiré, et le montre aux archives', () => {
    const disponible = "listings.lifecycle != 'inactive' AND listings.rented = 0";
    expect(query('').filter).toContain(disponible);
    expect(query('?all=true').filter).toContain(disponible);
    expect(query('?favorite=true').filter).toContain(disponible);
    // La vue des archivées les rend, avec leur raison.
    expect(query('?archived=true').filter).not.toContain('rented');
    expect(query('?archived=true').filter).not.toContain("'inactive'");
  });

  it('ouvre aux hors-critères sur demande explicite', () => {
    expect(query('?all=true').filter).not.toContain('matches_criteria = 1');
  });
});

/**
 * LA TRADUCTION D'UNE LIGNE SQL EN FICHE, et ce qu'elle laissait tomber.
 *
 * Un champ oublié ici ne lève pas : il vaut `undefined`, et l'écran qui le lit
 * l'écarte en silence. C'est ce qui est arrivé à la date d'alerte — l'historique
 * annonçait « aucune alerte » alors que la base en comptait cent dix-huit.
 */
describe('rowToListing — scores détaillés et trajets du lecteur', () => {
  /**
   * La fiche commune porte les raisons et les trajets du compte principal : ses
   * raisons citent son budget, ses trajets situent son domicile. Le 2026-09-11,
   * un visiteur anonyme lisait « Travail : 62 min, 14,4 km à vol d'oiseau ».
   * Chaque lecteur reçoit désormais les siens, joints depuis son score.
   */
  const commun = {
    id: 'century21:1',
    payload: JSON.stringify({
      title: { value: 'Studio' },
      distances: [{ label: 'Travail', distanceKm: 14.4, durationMinutes: 62, mode: 'transit' }],
      scores: {
        match: { value: 80, reasons: [{ code: 'price.ok', label: '950 € ≤ 1 000 € de budget' }] },
      },
    }),
  };

  it('ne rend jamais les trajets ni les raisons de la fiche commune', () => {
    const vue = rowToListing(commun);
    expect(vue['distances']).toEqual([]);
    expect((vue['scores'] as { match: { reasons: unknown[] } }).match.reasons).toEqual([]);
    expect(vue['title']).toEqual({ value: 'Studio' });
  });

  it('rend au lecteur SES trajets et SES raisons', () => {
    const vue = rowToListing({
      ...commun,
      user_distances: JSON.stringify([
        { label: 'Fac', distanceKm: 2, durationMinutes: 12, mode: 'transit' },
      ]),
      user_scores: JSON.stringify({
        match: { value: 60, reasons: [{ code: 'price.ok', label: '950 € ≤ 1 200 € de budget' }] },
      }),
    });
    expect(vue['distances']).toEqual([
      { label: 'Fac', distanceKm: 2, durationMinutes: 12, mode: 'transit' },
    ]);
    expect(vue['scores']).toEqual({
      match: { value: 60, reasons: [{ code: 'price.ok', label: '950 € ≤ 1 200 € de budget' }] },
    });
  });
});

describe('rowToListing', () => {
  const row = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'src:1',
    lifecycle: 'active',
    user_tracking: 'new',
    first_seen_at: '2026-09-01T10:00:00.000Z',
    last_seen_at: '2026-09-05T10:00:00.000Z',
    user_matches_criteria: 1,
    user_action_priority: 80,
    payload: '{"title":{"value":"Studio"}}',
    ...extra,
  });

  it('rend la DATE DE L’ALERTE, sans quoi l’historique est vide', () => {
    const listing = vueMoi(row({ user_notified_at: '2026-09-05T12:03:47.320Z' }));
    expect(listing['notifiedAt']).toBe('2026-09-05T12:03:47.320Z');
  });

  it('rend `null` — et non `undefined` — pour une annonce jamais signalée', () => {
    // `null` DIT quelque chose : cette annonce n'a pas fait l'objet d'une
    // alerte. `undefined` ne dit rien, et ne se distingue pas d'un champ
    // qu'on aurait oublié de recopier — c'est précisément la confusion qui a
    // fait disparaître l'historique.
    expect(vueMoi(row())['notifiedAt']).toBeNull();
  });

  it('rend les états qui appartiennent à QUELQU’UN, pas à l’annonce', () => {
    const listing = vueMoi(
      row({
        user_viewed: 1,
        user_archived: 0,
        user_favorite: 1,
        rented: 0,
        user_tracking: 'contacted',
      }),
    );
    expect(listing['viewed']).toBe(true);
    expect(listing['archived']).toBe(false);
    expect(listing['favorite']).toBe(true);
    expect(listing['tracking']).toBe('contacted');
  });

  it('ignore les colonnes homonymes de la fiche commune', () => {
    // Celles du compte principal : les lire les servait à tout le monde.
    const listing = vueMoi({
      id: 'src:1',
      payload: '{}',
      viewed: 1,
      archived: 1,
      favorite: 1,
      tracking: 'visited',
      matches_criteria: 1,
      action_priority: 90,
      notified_at: '2026-09-01T08:00:00.000Z',
    });
    expect(listing).toMatchObject({
      viewed: false,
      archived: false,
      favorite: false,
      tracking: 'new',
      matchesCriteria: false,
      actionPriority: 0,
      notifiedAt: null,
    });
  });

  it('tient pour archivée une annonce que sa source ferme aux candidatures', () => {
    const fermee = vueMoi(row({ payload: '{"applicationStatus":"full"}' }));
    expect(fermee['archived']).toBe(true);
    expect(vueMoi(row({ payload: '{"applicationStatus":"open"}' }))['archived']).toBe(false);
  });

  it('archive d’office une annonce louée ou retirée, jamais une annonce en doute', () => {
    expect(vueMoi(row({ rented: 1 }))).toMatchObject({ archived: true, archiveReason: 'rented' });
    expect(vueMoi(row({ lifecycle: 'inactive' }))).toMatchObject({
      archived: true,
      archiveReason: 'offline',
    });
    expect(vueMoi(row({ lifecycle: 'possiblyInactive' }))).toMatchObject({
      archived: false,
      archiveReason: null,
    });
    expect(vueMoi(row({ user_archived: 1 }))['archiveReason']).toBe('user');
  });

  it('déplie le payload par-dessus, sans écraser l’identifiant', () => {
    const listing = vueMoi(row());
    expect(listing['id']).toBe('src:1');
    expect(listing['title']).toEqual({ value: 'Studio' });
  });
});

/**
 * LA LISTE ALLÈGE, ET DOIT LE DIRE.
 *
 * Description et détail des scores sont retirés en SQL — ils pèsent les quatre
 * cinquièmes de la charge utile et la liste n'en affiche aucun. Mais le site
 * garde une seule collection d'annonces : sans marque, il prenait la version
 * allégée pour la fiche complète, affichait une description absente, et faisait
 * tomber tout le rendu. Page blanche, sans un mot.
 */
describe('fiche allégée', () => {
  const row = (extra: Record<string, unknown>): Record<string, unknown> => ({
    id: 'src:1',
    lifecycle: 'active',
    user_tracking: 'new',
    first_seen_at: '2026-09-01T10:00:00.000Z',
    last_seen_at: '2026-09-05T10:00:00.000Z',
    user_matches_criteria: 1,
    user_action_priority: 80,
    ...extra,
  });

  it('marque ce qui vient de la liste', () => {
    const listed = vueMoi(row({ payload_light: '{"title":{"value":"Studio"}}' }));
    expect(listed['partial']).toBe(true);
  });

  it('ne marque PAS la fiche entière', () => {
    const full = vueMoi(row({ payload: '{"title":{"value":"Studio"}}' }));
    expect(full['partial']).toBeUndefined();
  });

  /**
   * L'allègement se voit à ce qui MANQUE : c'est exactement le champ dont
   * l'absence faisait planter l'écran de fiche.
   */
  it('la version allégée n’a effectivement pas de description', () => {
    const listed = vueMoi(row({ payload_light: '{"title":{"value":"Studio"}}' }));
    expect(listed['description']).toBeUndefined();
    const full = vueMoi(
      row({ payload: '{"title":{"value":"Studio"},"description":{"value":"Texte"}}' }),
    );
    expect(full['description']).toEqual({ value: 'Texte' });
  });
});

/**
 * LA FICHE DE LISTE ASSEMBLÉE, et non analysée puis réémise.
 *
 * Relue, elle doit valoir `rowToListing` sur la ligne d'avant, clé pour clé :
 * c'est tout ce que l'écran connaît. Les lignes ci-dessous ont la forme des
 * charges utiles réelles — champs fusionnés, occurrences, photos.
 */
describe('listItemJson', () => {
  const champ = (value: unknown) => ({
    value,
    sourceId: 'orpi',
    observedAt: '2026-09-14T08:00:00.000Z',
    conflicts: [{ value: 'autre', sourceId: 'pap', observedAt: '2026-09-13T08:00:00.000Z' }],
  });
  const score = (value: number) => ({
    value,
    reasons: [{ code: 'price.ok', label: '950 € ≤ 1 000 € de budget', delta: 10 }],
    unknownSignals: ['views'],
    confidence: 0.75,
  });
  const fiche = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    title: champ('Studio « lumineux »\n\\ vue mer'),
    description: champ('Texte long'),
    price: champ(950),
    imageUrls: ['https://photos.example.invalid/1.jpg'],
    occurrences: [
      { id: 'orpi:1', sourceId: 'orpi', sourceUrl: 'https://orpi.example.invalid/1', price: 950 },
    ],
    applicationStatus: null,
    scores: {
      match: score(80),
      opportunity: score(40),
      visitProbability: score(55),
      risk: score(5),
    },
    distances: [{ label: 'Travail', distanceKm: 14.4, durationMinutes: 62, mode: 'transit' }],
    ...extra,
  });
  const colonnes = {
    id: 'orpi:1',
    lifecycle: 'active',
    user_tracking: 'new',
    first_seen_at: '2026-09-01T10:00:00.000Z',
    last_seen_at: '2026-09-05T10:00:00.000Z',
    user_matches_criteria: 1,
    user_action_priority: 72,
    user_viewed: 1,
    user_archived: 0,
    user_favorite: 0,
    rented: 0,
    user_notified_at: null,
    gone_notified_at: null,
    reminded_at: '2026-09-06T10:00:00.000Z',
  };

  /** Ce que retirait `json_remove` dans l'ancienne requête. */
  function allegee(payload: Record<string, unknown>): string {
    const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    delete copy['description'];
    const scores = copy['scores'] as Record<string, Record<string, unknown>> | undefined;
    for (const name of ['match', 'opportunity', 'visitProbability', 'risk']) {
      if (scores?.[name] !== undefined) delete scores[name]['reasons'];
    }
    return JSON.stringify(copy);
  }

  /** La ligne d'avant et celle d'aujourd'hui, pour la même fiche et le même lecteur. */
  function lignes(
    payload: Record<string, unknown>,
    lecteur: { scores?: unknown; distances?: string } = {},
    extra: Record<string, unknown> = {},
  ) {
    const userScores = lecteur.scores === undefined ? null : JSON.stringify(lecteur.scores);
    const list = listColumns(payload);
    return {
      avant: {
        ...colonnes,
        ...extra,
        payload_light: allegee(payload),
        user_scores: userScores,
        user_distances: lecteur.distances ?? null,
      },
      apres: {
        ...colonnes,
        ...extra,
        list_payload: list.payload,
        list_scores: list.scores,
        application_full: payload['applicationStatus'] === 'full' ? 1 : 0,
        own_list_scores: lecteur.scores === undefined ? null : reasonlessScores(lecteur.scores),
        user_scores: null,
        user_distances: lecteur.distances ?? null,
        score_ready: 1,
      },
    };
  }

  const pareil = ({ avant, apres }: ReturnType<typeof lignes>): void => {
    expect(JSON.parse(listItemJson(apres))).toEqual(rowToListing(avant));
  };

  it('vaut la ligne d’avant pour un lecteur sans score', () => {
    pareil(lignes(fiche()));
  });

  it('vaut la ligne d’avant avec les scores et trajets du lecteur', () => {
    pareil(
      lignes(fiche(), {
        scores: {
          match: score(60),
          opportunity: score(10),
          visitProbability: score(1),
          risk: score(0),
        },
        distances: JSON.stringify([{ label: 'Fac', distanceKm: 2, durationMinutes: 12 }]),
      }),
    );
  });

  it('vaut la ligne d’avant pour une fiche sans score ni champ', () => {
    pareil(lignes({}));
    const { scores: _scores, ...sansScore } = fiche();
    pareil(lignes(sansScore));
  });

  it('laisse la fiche l’emporter sur les colonnes, et le lecteur sur la fiche', () => {
    // Clés en double dans le texte : c'est la dernière qui compte à la lecture.
    const doublons = fiche({ id: 'autre', viewed: 'écrasé', partial: false, notifiedAt: 'x' });
    const { avant, apres } = lignes(doublons, { scores: { match: score(1) }, distances: '[]' });
    pareil({ avant, apres });
    const relu = JSON.parse(listItemJson(apres)) as Record<string, unknown>;
    expect(relu['id']).toBe('autre');
    expect(relu['partial']).toBe(false);
    expect(relu['scores']).toEqual({ match: { ...score(1), reasons: [] } });
  });

  it('archive d’office une fiche fermée aux candidatures', () => {
    const { avant, apres } = lignes(fiche({ applicationStatus: 'full' }));
    pareil({ avant, apres });
    expect((JSON.parse(listItemJson(apres)) as { archived: boolean }).archived).toBe(true);
  });

  it('archive d’office une fiche louée ou retirée, avec sa raison', () => {
    for (const [extra, raison] of [
      [{ rented: 1 }, 'rented'],
      [{ lifecycle: 'inactive' }, 'offline'],
    ] as const) {
      const { avant, apres } = lignes(fiche(), {}, extra);
      pareil({ avant, apres });
      expect(JSON.parse(listItemJson(apres))).toMatchObject({
        archived: true,
        archiveReason: raison,
      });
    }
  });

  it('rend `notifiedAt` du compte, jamais celui de la fiche', () => {
    pareil(lignes(fiche(), {}, { user_notified_at: '2026-09-10T10:00:00.000Z' }));
    const { apres } = lignes(fiche(), {}, { notified_at: '2026-09-02T10:00:00.000Z' });
    expect((JSON.parse(listItemJson(apres)) as { notifiedAt: unknown }).notifiedAt).toBeNull();
  });

  it('refait le calcul d’avant quand les colonnes préparées manquent', () => {
    const { avant } = lignes(fiche(), { scores: { match: score(3) } });
    const perimee = { ...avant, list_payload: null, score_ready: 0 };
    expect(JSON.parse(listItemJson(perimee))).toEqual(rowToListing(avant));
  });

  it('refait le calcul d’avant pour un score du lecteur écrit sans sa version préparée', () => {
    const { avant, apres } = lignes(fiche(), {
      scores: { match: score(3) },
      distances: '{pas du json',
    });
    const brut = {
      ...apres,
      own_list_scores: null,
      user_scores: avant.user_scores,
      score_ready: 0,
    };
    expect(JSON.parse(listItemJson(brut))).toEqual(rowToListing(avant));
  });

  /**
   * LES PHOTOS SONT LE PREMIER POIDS DE LA LISTE : des adresses à empreinte,
   * que la compression ne réduit pas, pour un carrousel qui en montre six.
   */
  const photos = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `https://photos.example.invalid/${i}.jpg`);

  it('ne transporte que sept photos, par les deux chemins', () => {
    const { avant, apres } = lignes(fiche({ imageUrls: photos(30) }));
    for (const ligne of [avant, apres]) {
      expect((JSON.parse(listItemJson(ligne)) as { imageUrls: string[] }).imageUrls).toEqual(
        photos(7),
      );
    }
  });

  it('laisse intacte une fiche qui en a moins, et une fiche sans photo', () => {
    for (const n of [0, 1, 7]) {
      const { apres } = lignes(fiche({ imageUrls: photos(n) }));
      expect((JSON.parse(listItemJson(apres)) as { imageUrls: string[] }).imageUrls).toEqual(
        photos(n),
      );
    }
  });

  it('ne coupe rien d’autre que les photos', () => {
    const { avant, apres } = lignes(fiche({ imageUrls: photos(30) }));
    const attendu = rowToListing(avant) as Record<string, unknown>;
    expect(JSON.parse(listItemJson(apres))).toEqual({ ...attendu, imageUrls: photos(7) });
  });
});

describe('capListPhotos', () => {
  /**
   * La coupe se fait dans le TEXTE, sans analyser la fiche : elle doit donc
   * savoir traverser une chaîne JSON, y compris quand celle-ci contient un
   * crochet ou un guillemet échappé.
   */
  it('respecte les échappements et les crochets dans une adresse', () => {
    const urls = ['a"b', 'c]d', 'e\\f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const texte = `{"imageUrls":${JSON.stringify(urls)},"suite":1}`;
    expect(JSON.parse(capListPhotos(texte))).toEqual({
      imageUrls: urls.slice(0, 7),
      suite: 1,
    });
  });

  it('rend le texte intact quand il n’y a rien à couper', () => {
    for (const texte of [
      '{"titre":"sans photo"}',
      '{"imageUrls":[]}',
      '{"imageUrls":[1,2,3,4,5,6,7,8]}',
      '{"imageUrls":[',
    ]) {
      expect(capListPhotos(texte)).toBe(texte);
    }
  });

  it('coupe au plafond demandé', () => {
    expect(capListPhotos('{"imageUrls":["a","b","c"]}', 2)).toBe('{"imageUrls":["a","b"]}');
  });
});

describe('etagMatches', () => {
  it('compare faiblement, comme l’exige If-None-Match', () => {
    expect(etagMatches('W/"abc"', 'W/"abc"')).toBe(true);
    expect(etagMatches('"abc"', 'W/"abc"')).toBe(true);
    expect(etagMatches('W/"zzz", W/"abc"', 'W/"abc"')).toBe(true);
    expect(etagMatches('*', 'W/"abc"')).toBe(true);
    expect(etagMatches('W/"abd"', 'W/"abc"')).toBe(false);
    expect(etagMatches(null, 'W/"abc"')).toBe(false);
  });
});

/**
 * LA CONSULTATION EST LIBRE, L'ACTION NE L'EST PAS.
 *
 * On ne demande pas de s'inscrire pour savoir ce qu'il y a à louer. Mais un
 * favori, un contact, une archive appartiennent à quelqu'un — et les réglages,
 * les alertes et les statistiques DISENT quelque chose de quelqu'un : les
 * servir à un inconnu reviendrait à les publier.
 *
 * Ce test vise le verrou lui-même. Il ne touche pas la base : tout ce qui est
 * refusé l'est AVANT la moindre requête, et c'est vérifié ici.
 */
describe('consultation sans compte', () => {
  const executed: string[] = [];
  const db = {
    execute: (statement: unknown) => {
      executed.push(typeof statement === 'string' ? statement : JSON.stringify(statement));
      return Promise.resolve({ rows: [] });
    },
  } as unknown as Parameters<typeof route>[0];

  const call = async (method: string, path: string): Promise<Response> => {
    const url = new URL(`https://exemple.invalid${path}`);
    const segments = url.pathname.split('/').filter((part) => part !== '');
    return await route(
      db,
      new Request(url, { method }),
      url,
      segments,
      {},
      // `null` : personne n'est connecté.
      null,
    );
  };

  const refusees = [
    ['GET', '/api/stats'],
    ['GET', '/api/alerts'],
    ['GET', '/api/config'],
    ['GET', '/api/settings/saved-searches'],
    ['GET', '/api/documents'],
  ] as const;

  for (const [method, path] of refusees) {
    it(`refuse ${method} ${path} — cette lecture est personnelle`, async () => {
      executed.length = 0;
      const response = await call(method, path);
      expect(response.status).toBe(401);
      // Rien n'est allé jusqu'à la base.
      expect(executed).toHaveLength(0);
    });
  }

  const ecritures = [
    ['PATCH', '/api/listings/bienici%3Aabc'],
    ['POST', '/api/listings/bienici%3Aabc/contact'],
    ['PUT', '/api/config'],
    ['POST', '/api/push'],
  ] as const;

  for (const [method, path] of ecritures) {
    it(`refuse ${method} ${path} — agir appartient à quelqu'un`, async () => {
      executed.length = 0;
      const response = await call(method, path);
      expect(response.status).toBe(401);
      expect(executed).toHaveLength(0);
    });
  }

  it("refuse une ressource du catalogue dès qu'on tente de l'écrire", async () => {
    // `listings` est consultable ; cela n'en fait pas une ressource modifiable.
    expect((await call('DELETE', '/api/listings/x')).status).toBe(401);
    expect((await call('PUT', '/api/sources')).status).toBe(401);
  });

  it('laisse passer le catalogue en lecture', async () => {
    for (const path of [
      '/api/listings',
      '/api/districts',
      '/api/sources',
      '/api/agencies',
      '/api/price-histogram',
    ]) {
      executed.length = 0;
      const response = await call('GET', path);
      expect(response.status, path).not.toBe(401);
      // Et là, on va bien chercher les données.
      expect(executed.length, path).toBeGreaterThan(0);
    }
  });

  it('sert le catalogue sous une identité qui ne possède rien', async () => {
    executed.length = 0;
    await call('GET', '/api/listings');
    // Les états personnels sont attachés par jointure externe sur
    // l'identifiant : c'est LUI qui garantit zéro favori et zéro score, sans
    // qu'une seule requête ait à connaître le cas du visiteur.
    expect(executed.join(' ')).toContain('anonyme');
    expect(executed.join(' ')).not.toContain('"moi"');
  });
});

/**
 * L'HISTORIQUE DES NOTIFICATIONS S'ARRÊTAIT NET, sans erreur.
 *
 * La requête ajoutait `us.notified_at AS notified_at` à un `listings.*` qui
 * apporte déjà une colonne de ce nom. Deux homonymes dans un même résultat :
 * c'est la première qui l'emporte, donc celle de `listings`, figée au jour de
 * la bascule multi-compte. Toute annonce signalée depuis revenait à `null`, et
 * l'écran — qui ne garde que les fiches portant cette date — affichait un
 * historique arrêté trois jours plus tôt.
 */
describe('date de notification — celle du compte, pas celle d’avant', () => {
  it('préfère la valeur du compte à la colonne héritée', () => {
    const listing = vueMoi({
      id: 'fnaim:1',
      payload: '{}',
      notified_at: '2026-09-06T22:53:50.379Z',
      user_notified_at: '2026-09-09T11:24:35.914Z',
    });
    expect(listing['notifiedAt']).toBe('2026-09-09T11:24:35.914Z');
  });

  it('rend la date du compte même quand l’héritée est vide', () => {
    // Le cas qui cassait : signalée après la bascule, donc absente de
    // `listings.notified_at`.
    const listing = vueMoi({
      id: 'fnaim:2',
      payload: '{}',
      notified_at: null,
      user_notified_at: '2026-09-08T12:02:05.135Z',
    });
    expect(listing['notifiedAt']).toBe('2026-09-08T12:02:05.135Z');
  });

  it('ne retombe plus sur l’héritée : c’était celle du compte principal', () => {
    // La migration 0041 l'a recopiée dans son état ; les autres n'ont pas à la lire.
    const listing = vueMoi({
      id: 'fnaim:3',
      payload: '{}',
      notified_at: '2026-09-01T08:00:00.000Z',
    });
    expect(listing['notifiedAt']).toBeNull();
  });

  it('rend null quand aucune des deux n’existe', () => {
    expect(vueMoi({ id: 'fnaim:4', payload: '{}' })['notifiedAt']).toBeNull();
  });
});

describe('histogramme des loyers', () => {
  const bounds = { min: 200, max: 400, step: 50 };

  it('découpe en tranches régulières, bornes comprises', () => {
    const histogram = buildPriceHistogram([], bounds);
    expect(histogram.buckets.map(({ from, to }) => [from, to])).toEqual([
      [200, 250],
      [250, 300],
      [300, 350],
      [350, 400],
    ]);
    expect(histogram.buckets.every(({ count }) => count === 0)).toBe(true);
  });

  it('range chaque loyer dans sa tranche, la borne basse incluse', () => {
    const histogram = buildPriceHistogram(
      [
        { price: 250, count: 2 },
        { price: 299, count: 1 },
        { price: 300, count: 4 },
      ],
      bounds,
    );
    expect(histogram.buckets.map(({ count }) => count)).toEqual([0, 3, 4, 0]);
  });

  it('replie les extrêmes dans la première et la dernière tranche', () => {
    const histogram = buildPriceHistogram(
      [
        { price: 90, count: 1 },
        { price: 400, count: 2 },
        { price: 3200, count: 5 },
      ],
      bounds,
    );
    expect(histogram.buckets.map(({ count }) => count)).toEqual([1, 0, 0, 7]);
  });

  it('ignore les lignes illisibles', () => {
    const histogram = buildPriceHistogram(
      [
        { price: Number.NaN, count: 3 },
        { price: 260, count: 0 },
      ],
      bounds,
    );
    expect(histogram.buckets.map(({ count }) => count)).toEqual([0, 0, 0, 0]);
  });

  it('suit par défaut les bornes du curseur de budget', () => {
    const histogram = buildPriceHistogram([]);
    expect(histogram.buckets).toHaveLength(46);
    expect(histogram.buckets.at(-1)).toEqual({ from: 2450, to: 2500, count: 0 });
  });

  it('ne compte que l’offre en ligne, sans tenir compte du budget', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: (statement: unknown) => {
        statements.push(statement);
        return Promise.resolve({ rows: [{ price: 610, n: 3 }] });
      },
    } as unknown as Parameters<typeof route>[0];
    const url = new URL('https://exemple.invalid/api/price-histogram');
    const response = await route(db, new Request(url), url, ['api', 'price-histogram'], {}, null);
    const body = (await response.json()) as { buckets: { from: number; count: number }[] };
    expect(body.buckets.find((bucket) => bucket.from === 600)?.count).toBe(3);
    const sql = JSON.stringify(statements);
    expect(sql).toContain("lifecycle != 'inactive'");
    expect(sql).toContain('rented = 0');
    expect(sql).not.toContain('price <=');
  });
});

/**
 * LE BUDGET SE COMPARE AU TOTAL, CHARGES COMPRISES.
 *
 * Le studio relevé le 2026-09-17 affiche 566 € et 158 € de provision : il se
 * loue 724 €, et la liste le retenait dans un budget de 700 € parce que seule
 * la colonne `price` était comparée. La base ne peut pas appeler
 * `rentForBudget` ; ces tests vérifient que son jumeau SQL dit la même chose.
 */
describe('le loyer comparé au budget', () => {
  const filtres = {
    maxPrice: 700,
    minArea: 20,
    landlordFilter: 'all',
    furnishedFilter: 'all',
  } as const;

  it('entre dans la clause de la liste', () => {
    const { filter } = buildListQuery(
      new URL('https://exemple.invalid/api/listings'),
      filtres,
      false,
    );
    expect(filter).toContain(RENT_FOR_BUDGET_SQL);
    expect(filter).not.toContain('(price IS NULL OR price <= ?)');
  });

  it('laisse le PLANCHER sur le loyer publié : un box reste un box', () => {
    const { filter } = buildListQuery(
      new URL('https://exemple.invalid/api/listings'),
      { ...filtres, minPrice: 250 },
      false,
    );
    expect(filter).toContain('(price IS NULL OR price >= ?)');
  });

  it('additionne la provision exactement comme `rentForBudget`', async () => {
    const db = createClient({ url: ':memory:' });
    await db.execute('CREATE TABLE listings (id TEXT, price REAL, payload TEXT)');
    const cas: readonly [string, number, number | null, boolean | null][] = [
      ['hors-charges', 566, 158, false],
      ['charges-comprises', 690, 80, true],
      ['sans-provision', 690, null, false],
      ['base-inconnue', 690, 80, null],
    ];
    for (const [id, price, charges, chargesIncluded] of cas) {
      await db.execute({
        sql: 'INSERT INTO listings (id, price, payload) VALUES (?, ?, ?)',
        args: [
          id,
          price,
          JSON.stringify({ chargesIncluded, charges: { value: charges, sourceId: 'test' } }),
        ],
      });
    }
    const retenus = await db.execute({
      sql: `SELECT id FROM listings WHERE ${RENT_FOR_BUDGET_SQL} <= ? ORDER BY id`,
      args: [700],
    });
    // 566 + 158 = 724 : au-dessus du budget, et seul à en sortir.
    expect(retenus.rows.map((row) => row['id'])).toEqual([
      'base-inconnue',
      'charges-comprises',
      'sans-provision',
    ]);
    for (const [id, price, charges, chargesIncluded] of cas) {
      const mesure = await db.execute({
        sql: `SELECT ${RENT_FOR_BUDGET_SQL} AS total FROM listings WHERE id = ?`,
        args: [id],
      });
      expect(mesure.rows[0]?.['total']).toBe(rentForBudget({ price, charges, chargesIncluded }));
    }
  });
});

/**
 * LE PLAFOND DE SURFACE, CÔTÉ SQL.
 *
 * La surface n'avait qu'un plancher : rien n'écartait les grands logements
 * qu'on ne cherche pas. Le plafond s'applique en direct comme le reste, sans
 * recollecter — et il n'écarte jamais une annonce dont la surface est inconnue.
 */
describe('buildListQuery — le plafond de surface', () => {
  const url = new URL('https://exemple.invalid/api/listings');

  it('pose la condition quand un plafond est demandé', () => {
    const query = buildListQuery(url, { maxPrice: 700, minArea: 20, maxArea: 60 });
    expect(query.filter).toContain('area <= ?');
    expect(query.filterArgs).toContain(60);
  });

  it('ne pose rien quand aucun plafond n’est demandé', () => {
    const query = buildListQuery(url, { maxPrice: 700, minArea: 20 });
    expect(query.filter).not.toContain('area <= ?');
  });

  /** Un champ NULL n'exclut jamais : la source s'est tue, pas l'annonce (§17). */
  it('laisse passer une surface inconnue', () => {
    const query = buildListQuery(url, { maxPrice: 700, minArea: 20, maxArea: 60 });
    expect(query.filter).toContain('(area IS NULL OR area <= ?)');
  });

  it('se relit depuis les critères enregistrés', () => {
    expect(parseLiveFilters({ maxPrice: 700, minArea: 20, maxArea: 60 })?.maxArea).toBe(60);
    expect(parseLiveFilters({ maxPrice: 700, minArea: 20 })?.maxArea).toBeUndefined();
  });
});

/**
 * LE TRI « PLUS RÉCENTES » NE CLASSAIT PAS CE QU'ON LISAIT.
 *
 * Il se faisait sur la seule date de DÉCOUVERTE, pendant que la carte affiche
 * la date de PUBLICATION dès que la source la donne. Mesuré le 2026-09-22 :
 * 1 254 annonces actives portent une publication, et 1 087 tombent un autre
 * jour que leur découverte — « publiée il y a trois jours » s'affichait
 * au-dessus de « publiée aujourd'hui », et le tri paraissait ne rien faire.
 */
describe('buildListQuery — le tri par fraîcheur', () => {
  const trier = (sort: string): string =>
    buildListQuery(new URL(`https://exemple.invalid/api/listings?sort=${sort}`)).orderBy;

  it('classe sur la date affichée : publication, sinon découverte', () => {
    expect(trier('recent')).toContain('COALESCE(listings.published_at, listings.first_seen_at)');
    expect(trier('recent')).toContain('DESC');
  });

  /** Une date de collecte n'est pas une date d'annonce : elle bouge à chaque passage. */
  it('ne classe jamais sur la dernière vue', () => {
    expect(trier('recent')).not.toContain('last_seen_at');
  });

  it('départage la priorité par la même date, et non par une autre', () => {
    const priorite = trier('priority');
    expect(priorite).toContain('sc.action_priority DESC');
    expect(priorite).toContain('COALESCE(listings.published_at, listings.first_seen_at)');
  });
});
