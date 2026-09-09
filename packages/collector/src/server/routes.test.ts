/**
 * L'ordre d'une liste ne lève jamais d'erreur : il est seulement FAUX, et il
 * faut le remarquer à l'œil. Deux tris l'étaient, relevés le 2026-09-05 sur
 * l'inventaire réel — d'où des tests sur la clause elle-même.
 */

import { describe, expect, it } from 'vitest';
import { buildListQuery, route, rowToListing } from './routes.js';

const query = (search: string) =>
  buildListQuery(new URL(`https://exemple.invalid/api/listings${search}`));

describe('ordre de la liste', () => {
  it('compte « récent » à la DÉCOUVERTE, pas à la dernière vue', () => {
    // `last_seen_at` se rafraîchit à chaque collecte : une annonce en ligne
    // depuis trois mois y paraissait plus récente qu'une trouvée le matin
    // même. Mesuré : la 1re du classement datait de quatre jours, la 20e du
    // jour même.
    expect(query('?sort=recent').orderBy).toBe('first_seen_at DESC');
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

  it('départage la priorité par la découverte, pour la même raison', () => {
    // `sc.` : la priorité vient du score DU COMPTE, pas de la fiche.
    expect(query('').orderBy).toBe('sc.action_priority DESC, first_seen_at DESC');
    expect(query('?sort=priority').orderBy).toBe('sc.action_priority DESC, first_seen_at DESC');
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
describe('rowToListing', () => {
  const row = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'src:1',
    lifecycle: 'active',
    tracking: 'new',
    first_seen_at: '2026-09-01T10:00:00.000Z',
    last_seen_at: '2026-09-05T10:00:00.000Z',
    matches_criteria: 1,
    action_priority: 80,
    payload: '{"title":{"value":"Studio"}}',
    ...extra,
  });

  it('rend la DATE DE L’ALERTE, sans quoi l’historique est vide', () => {
    const listing = rowToListing(row({ notified_at: '2026-09-05T12:03:47.320Z' }));
    expect(listing['notifiedAt']).toBe('2026-09-05T12:03:47.320Z');
  });

  it('rend `null` — et non `undefined` — pour une annonce jamais signalée', () => {
    // `null` DIT quelque chose : cette annonce n'a pas fait l'objet d'une
    // alerte. `undefined` ne dit rien, et ne se distingue pas d'un champ
    // qu'on aurait oublié de recopier — c'est précisément la confusion qui a
    // fait disparaître l'historique.
    expect(rowToListing(row())['notifiedAt']).toBeNull();
  });

  it('rend les états qui appartiennent à QUELQU’UN, pas à l’annonce', () => {
    const listing = rowToListing(
      row({ viewed: 1, archived: 0, favorite: 1, rented: 0, tracking: 'contacted' }),
    );
    expect(listing['viewed']).toBe(true);
    expect(listing['archived']).toBe(false);
    expect(listing['favorite']).toBe(true);
    expect(listing['tracking']).toBe('contacted');
  });

  it('déplie le payload par-dessus, sans écraser l’identifiant', () => {
    const listing = rowToListing(row());
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
    tracking: 'new',
    first_seen_at: '2026-09-01T10:00:00.000Z',
    last_seen_at: '2026-09-05T10:00:00.000Z',
    matches_criteria: 1,
    action_priority: 80,
    ...extra,
  });

  it('marque ce qui vient de la liste', () => {
    const listed = rowToListing(row({ payload_light: '{"title":{"value":"Studio"}}' }));
    expect(listed['partial']).toBe(true);
  });

  it('ne marque PAS la fiche entière', () => {
    const full = rowToListing(row({ payload: '{"title":{"value":"Studio"}}' }));
    expect(full['partial']).toBeUndefined();
  });

  /**
   * L'allègement se voit à ce qui MANQUE : c'est exactement le champ dont
   * l'absence faisait planter l'écran de fiche.
   */
  it('la version allégée n’a effectivement pas de description', () => {
    const listed = rowToListing(row({ payload_light: '{"title":{"value":"Studio"}}' }));
    expect(listed['description']).toBeUndefined();
    const full = rowToListing(
      row({ payload: '{"title":{"value":"Studio"},"description":{"value":"Texte"}}' }),
    );
    expect(full['description']).toEqual({ value: 'Texte' });
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
    for (const path of ['/api/listings', '/api/districts', '/api/sources', '/api/agencies']) {
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
    const listing = rowToListing({
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
    const listing = rowToListing({
      id: 'fnaim:2',
      payload: '{}',
      notified_at: null,
      user_notified_at: '2026-09-08T12:02:05.135Z',
    });
    expect(listing['notifiedAt']).toBe('2026-09-08T12:02:05.135Z');
  });

  it('retombe sur l’héritée pour les fiches d’avant la bascule', () => {
    // Leur état personnel n'a pas été recopié : sans ce repli, leur historique
    // disparaîtrait de l'écran.
    const listing = rowToListing({
      id: 'fnaim:3',
      payload: '{}',
      notified_at: '2026-09-01T08:00:00.000Z',
    });
    expect(listing['notifiedAt']).toBe('2026-09-01T08:00:00.000Z');
  });

  it('rend null quand aucune des deux n’existe', () => {
    expect(rowToListing({ id: 'fnaim:4', payload: '{}' })['notifiedAt']).toBeNull();
  });
});
