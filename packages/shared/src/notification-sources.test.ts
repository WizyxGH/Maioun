import { describe, expect, it } from 'vitest';
import {
  ALL_NOTIFICATION_SOURCES,
  parseNotificationSources,
  restrictsNotificationSources,
  sourceFilterSql,
} from './notification-sources.js';

describe('le filtre par source des notifications', () => {
  /**
   * RIGUEUX À VOLONTÉ, PARCE QUE L'ERREUR NE SE VOIT PAS.
   *
   * Une liste illisible se lirait sinon comme « toutes les sources » — donc on
   * recevrait tout — ou comme « aucune » — donc on ne recevrait plus rien. Les
   * deux font le contraire de ce qui a été demandé, et sans le moindre signe à
   * l'écran : la listeurait filtrée par elle-même.
   */
  it('retombe sur « aucune restriction » devant une valeur illisible', () => {
    for (const etrange of [
      null,
      undefined,
      'locservice',
      42,
      [],
      { mode: 'peut-être', ids: ['a'] },
      { mode: 'except' },
      { mode: 'only', ids: 'locservice' },
    ]) {
      expect(parseNotificationSources(etrange)).toEqual(ALL_NOTIFICATION_SOURCES);
    }
  });

  /**
   * « Toutes sauf LocService » doit rester vrai quand une agence est ajoutée le
   * lendemain. Une liste figée de 225 identifiants se périmerait — c'est
   * exactement ce que le mode « sauf » évite, et il ne faut pas le casser en
   * absorbant les enregistrements.
   */
  it('conserve le mode et la liste tels quels', () => {
    expect(parseNotificationSources({ mode: 'except', ids: ['locservice'] })).toEqual({
      mode: 'except',
      ids: ['locservice'],
    });
    expect(parseNotificationSources({ mode: 'only', ids: ['orpi', 'seloger'] })).toEqual({
      mode: 'only',
      ids: ['orpi', 'seloger'],
    });
  });

  /** Un doublon ne dit rien de plus et gonflerait la requête pour rien. */
  it('retire les doublons et les valeurs qui ne sont pas des noms', () => {
    expect(parseNotificationSources({ mode: 'except', ids: ['a', 'a', 'b', 7, null] })).toEqual({
      mode: 'except',
      ids: ['a', 'b'],
    });
  });

  it('ne restreint rien quand aucune source n’est nommée', () => {
    expect(restrictsNotificationSources(parseNotificationSources({ mode: 'only', ids: [] }))).toBe(
      false,
    );
    expect(restrictsNotificationSources(ALL_NOTIFICATION_SOURCES)).toBe(false);
  });

  /**
   * AUCUN FILTRE NE DOIT PRODUIRE DE SQL.
   *
   * C'est le chemin de tous les comptes qui n'ont rien exclu : s'il devenait
   * coûteux, tout le monde le payerait pour une restriction que personne n'a
   * demandée.
   */
  it('ne rend aucun SQL quand rien n’est exclu', () => {
    expect(sourceFilterSql(ALL_NOTIFICATION_SOURCES)).toEqual({ sql: '', args: [] });
    expect(sourceFilterSql({ mode: 'only', ids: [] })).toEqual({ sql: '', args: [] });
  });

  it('écarte par les occurrences, pas par une colonne de la fiche', () => {
    const { sql, args } = sourceFilterSql({ mode: 'except', ids: ['locservice', 'rentola'] });
    // La fiche dédoublonnée vient de plusieurs sources : c'est par là qu'on
    // passe, sinon la colonne de `listings` — qui n'en a pas — trancherait.
    expect(sql).toContain('occurrences');
    expect(sql).toContain('group_id = listings.id');
    expect(sql).toContain('NOT EXISTS');
    expect(args).toEqual(['locservice', 'rentola']);
    // Un `?` par source nommée, dans l'ordre.
    expect(sql.match(/\?/g)).toHaveLength(2);
  });

  /**
   * « SEULEMENT » EST L'INVERSE, et l'oublier fait pire qu'une absence de
   * filtre : la liste se dit restreinte, affiche tout, et signale tout. Le
   * test l'attrape parce qu'il vérifie le SQL, pas le comportement.
   */
  it('inverse le prédicat en mode « seulement »', () => {
    const { sql } = sourceFilterSql({ mode: 'only', ids: ['locservice'] });
    expect(sql).toContain('EXISTS');
    expect(sql).not.toContain('NOT EXISTS');
  });
});
